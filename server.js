require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const { initializeDatabase } = require('./utils/db-adapter')

const app = express()
const PORT = process.env.PORT || 8080

// 注册的路由列表（用于API文档显示）
const registeredRoutes = []

// 创建数据库上下文
let dbContext = {
  type: 'postgres',
  instance: null,
  isReady: false
}

// 连接PostgreSQL
async function initPostgres() {
  console.log('🔗 连接PostgreSQL数据库...')
  
  // 验证必要的环境变量
  const requiredEnvVars = ['PGUSER', 'PGHOST', 'PGDATABASE', 'PGPASSWORD', 'PGPORT']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    throw new Error(`❌ 缺少必要的环境变量: ${missingVars.join(', ')}`)
  }

  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20 // 最大连接数
  })

  try {
    // 测试连接
    const client = await pool.connect()
    console.log('✅ 成功连接到PostgreSQL数据库')
    client.release()
    return pool
  } catch (err) {
    console.error('❌ PostgreSQL连接失败:', err.message)
    throw err
  }
}
// 初始化数据库
async function initDatabase() {
  try {
    const pool = await initPostgres()
    dbContext.instance = pool
    dbContext.isReady = true
    
    // 使数据库上下文全局可用
    global.dbContext = dbContext
    console.log('✅ 数据库初始化完成，使用: PostgreSQL')
    
  } catch (err) {
    console.error('❌ PostgreSQL初始化失败，应用将退出:', err.message)
    process.exit(1)
  }
}

// 中间件
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// 路由注册辅助函数
function registerRoute(method, path, description) {
  registeredRoutes.push({ method: method.toUpperCase(), path, description })
}

// 导入路由
const authRouter = require('./API/auth')
const inputdataRouter = require('./API/inputdata')
const reportsRouter = require('./API/reports')

// 使用路由
app.use('/api', authRouter)
app.use('/api', inputdataRouter)
app.use('/api', reportsRouter)

// 注册路由信息（手动维护，避免使用内部API）
registerRoute('POST', '/api/login', 'TOTP登录验证')
registerRoute('POST', '/api/inputdata', '提交通报数据')
registerRoute('GET', '/api/reports/today/stats', '获取今日统计数据')
registerRoute('GET', '/api/reports/today/details', '获取今日明细数据')
registerRoute('GET', '/api/reports/:yearMonth', '获取特定月份的通报')
registerRoute('GET', '/api/reports/date/:date', '获取特定日期的通报')
registerRoute('GET', '/api/reports/date/:date/class/:classNum', '获取特定日期和班级的通报')
registerRoute('GET', '/api/reports/class/:classNum/range/:startDate/:endDate', '获取班级在日期范围内的通报')

// 根路由
app.get('/', (req, res) => {
  res.json({ 
    message: 'KAS Backend Server Running',
    version: '1.0.0',
    dbType: dbContext.type,
    timestamp: new Date().toISOString(),
    routes: registeredRoutes
  })
})

// 健康检查路由
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    const client = await dbContext.instance.connect()
    client.release()
    
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// 全局异步错误处理中间件
app.use((err, req, res, next) => {
  console.error('🚨 服务器错误:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  })
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  })
})

// 404处理 - 简化版本
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.path}`,
    availableRoutes: registeredRoutes
  })
})

// 优雅关闭处理
async function gracefulShutdown(signal) {
  console.log(`\n🛑 收到 ${signal} 信号，开始优雅关闭...`)
  
  try {
    if (dbContext.instance) {
      await dbContext.instance.end()
      console.log('✅ 数据库连接池已关闭')
    }
    
    console.log('✅ 服务器已优雅关闭')
    process.exit(0)
  } catch (error) {
    console.error('❌ 关闭过程中出错:', error)
    process.exit(1)
  }
}

// 注册优雅关闭信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('🚨 未捕获的异常:', err)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 未处理的Promise拒绝:', reason)
  gracefulShutdown('unhandledRejection')
})

// 启动应用
async function startApp() {
  try {
    console.log('🚀 KAS Backend Server 启动中...')
    
    // 1. 初始化数据库连接
    await initDatabase()
    
    // 2. 初始化数据库表和索引
    console.log('📋 初始化数据库表和索引...')
    await initializeDatabase()
    
    // 3. 启动HTTP服务器
    const server = app.listen(PORT, () => {
      console.log(`✅ KAS Backend Server 运行在端口 ${PORT}`)
      console.log(`📍 API根地址: http://localhost:${PORT}`)
      console.log(`🔍 健康检查: http://localhost:${PORT}/health`)
      console.log(`📚 API文档: http://localhost:${PORT}/`)
      console.log(`🗄️  数据库: PostgreSQL (${process.env.PGHOST}:${process.env.PGPORT})`)
    })
    
    // 设置服务器超时
    server.timeout = 30000 // 30秒
    
    return server
    
  } catch (err) {
    console.error('❌ 应用启动失败:', err.message)
    if (err.stack) {
      console.error('错误堆栈:', err.stack)
    }
    process.exit(1)
  }
}

// 启动应用
startApp().catch(err => {
  console.error('❌ 启动过程中出现未处理的错误:', err)
  process.exit(1)
})