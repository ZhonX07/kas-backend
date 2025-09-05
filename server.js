require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const { initWebSocket } = require('./websocket')
const { initializeDatabase } = require('./utils/db-adapter')

const app = express()
const PORT = process.env.PORT || 8080
const HOST = process.env.HOST || '0.0.0.0'

// 解析CORS允许的源
const parseCorsOrigins = (originsString) => {
  const staticOrigins = originsString.split(',').map(origin => origin.trim())
  
  // 添加动态正则表达式
  const dynamicOrigins = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ]
  
  // 如果配置中包含特定IP，添加对应的动态正则
  const ipPattern = staticOrigins.find(origin => origin.includes('117.72.79.92'))
  if (ipPattern) {
    dynamicOrigins.push(/^http:\/\/117\.72\.79\.92:\d+$/)
  }
  
  return [...staticOrigins, ...dynamicOrigins]
}

// 数据库连接池配置
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20')
})

// Attach pool to the app object to make it accessible for shutdown
app.set('dbPool', pool)

// 全局数据库上下文
global.dbContext = {
  type: 'postgres',
  instance: pool,
  isReady: false
}

// CORS中间件配置
app.use(cors({
  origin: parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173'),
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200 // 一些旧浏览器会挂在 204
}))

// 预检请求处理
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin')
  res.header('Access-Control-Allow-Credentials', 'true')
  res.sendStatus(200)
})

// 全局CORS头设置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Credentials', 'true')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin')
  next()
})

// 解析JSON和URL编码的请求体
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '10mb' }))
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '10mb' }))

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`)
  next()
})

// 数据库连接中间件
function requireDatabase(req, res, next) {
  if (!global.dbContext || !global.dbContext.isReady) {
    return res.status(503).json({
      success: false,
      message: '数据库连接未就绪'
    })
  }
  next()
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: global.dbContext?.isReady ? 'connected' : 'disconnected'
  })
})

// 导入路由
const reportsRoutes = require('./API/reports')
const authRoutes = require('./API/auth')
const inputDataRoutes = require('./API/inputdata') // 导入inputdata路由

// 注册路由
app.use('/api', reportsRoutes)
app.use('/api', authRoutes)
app.use('/api', inputDataRoutes) // 注册inputdata路由

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err)
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '路由不存在'
  })
})

// 初始化数据库并启动服务器
async function startServer() {
  try {
    console.log('🔄 初始化数据库...')
    await initializeDatabase()
    global.dbContext.isReady = true
    console.log('✅ 数据库初始化完成')

    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 服务器运行在 ${HOST}:${PORT}`)
      console.log(`🔗 健康检查: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`)
      console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`)
      console.log(`📊 数据库: ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`)
      console.log(`📡 CORS允许的源: ${process.env.CORS_ALLOWED_ORIGINS || 'default'}`)
    })

    // Setup WebSocket
    const wss = initWebSocket(server)
    console.log('🔌 WebSocket服务已启动')

    // 优雅关闭处理
    process.on('SIGTERM', () => {
      console.log('收到SIGTERM信号，开始优雅关闭...')
      server.close(() => {
        console.log('服务器已关闭')
        // Retrieve the pool from the app object
        const dbPool = app.get('dbPool')
        dbPool.end(() => {
          console.log('数据库连接池已关闭')
          process.exit(0)
        })
      })
    })

  } catch (error) {
    console.error('❌ 服务器启动失败:', error)
    
    // 如果是路由相关错误，给出更具体的提示
    if (error.message.includes('path-to-regexp') || error.message.includes('parameter name')) {
      console.error('💡 可能的解决方案:')
      console.error('   1. 检查路由定义中的参数格式')
      console.error('   2. 确保所有路由参数都有正确的名称')
      console.error('   3. 尝试降级 path-to-regexp 版本')
    }
    
    process.exit(1)
  }
}

startServer()