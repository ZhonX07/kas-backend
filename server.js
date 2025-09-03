require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { Pool } = require('pg')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 8080

// 数据库配置
const DB_TYPE = process.env.DB_TYPE || 'auto' // 可选: 'postgres', 'sqlite', 'auto'

// 创建数据库上下文
let dbContext = {
  type: null,
  instance: null,
  isReady: false
}

// 尝试连接PostgreSQL
async function initPostgres() {
  console.log('尝试连接PostgreSQL数据库...')
  const pool = new Pool({
    user: process.env.PGUSER || 'kas_user',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'kas_db',
    password: process.env.PGPASSWORD || 'Xdcy1/2anddied',
    port: process.env.PGPORT || 5432,
    // 设置较短的连接超时，以便快速失败
    connectionTimeoutMillis: 5000
  })

  try {
    // 测试连接
    const client = await pool.connect()
    console.log('成功连接到远程PostgreSQL数据库')
    client.release()
    return pool
  } catch (err) {
    console.warn('PostgreSQL连接失败:', err.message)
    throw err
  }
}

// 初始化SQLite
function initSqlite() {
  console.log('初始化SQLite数据库...')
  // 确保DB目录存在
  const dbDir = path.join(__dirname, 'DB')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  
  // 使用better-sqlite3
  const Database = require('better-sqlite3')
  return { sqlite: true }
}

// 初始化数据库
async function initDatabase() {
  if (DB_TYPE === 'postgres') {
    try {
      const pool = await initPostgres()
      dbContext.type = 'postgres'
      dbContext.instance = pool
      dbContext.isReady = true
    } catch (err) {
      console.error('PostgreSQL初始化失败，应用将退出')
      process.exit(1)
    }
  } else if (DB_TYPE === 'sqlite') {
    dbContext.type = 'sqlite'
    dbContext.instance = initSqlite()
    dbContext.isReady = true
  } else {
    // 自动模式：尝试PostgreSQL，失败则回退到SQLite
    try {
      const pool = await initPostgres()
      dbContext.type = 'postgres'
      dbContext.instance = pool
      dbContext.isReady = true
    } catch (err) {
      console.log('自动回退到SQLite数据库')
      dbContext.type = 'sqlite'
      dbContext.instance = initSqlite()
      dbContext.isReady = true
    }
  }
  
  // 使数据库上下文全局可用
  global.dbContext = dbContext
  console.log(`数据库初始化完成，使用: ${dbContext.type}`)
}

// 中间件
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 初始化路由
const router = express.Router()
app.use(router)

// 导入路由
const authRouter = require('./API/auth')
const inputdataRouter = require('./API/inputdata')

// 使用路由
app.use('/api', authRouter)
app.use('/api', inputdataRouter)

// 调试：打印所有注册的路由
if (app._router) {
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
      console.log('已注册路由:', r.route.path)
    }
  })
}

// 根路由
app.get('/', (req, res) => {
  res.json({ 
    message: 'KAS Backend Server Running',
    version: '1.0.0',
    dbType: dbContext.type,
    endpoints: [
      'POST /api/login - TOTP登录验证',
      'POST /api/inputdata - 提交通报数据',
      'GET /api/reports/:yearMonth - 获取特定月份的通报',
      'GET /api/reports/date/:date - 获取特定日期的通报',
      'GET /api/reports/date/:date/class/:classNum - 获取特定日期和班级的通报',
      'GET /api/reports/class/:classNum/range/:startDate/:endDate - 获取班级在日期范围内的通报'
    ]
  })
})

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.stack)
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  })
})

// 404处理 - 使用正则表达式替代通配符
app.use(/(.*)?/, (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  })
})

// 在应用结束时关闭连接
process.on('SIGINT', () => {
  if (dbContext.type === 'postgres' && dbContext.instance) {
    dbContext.instance.end().then(() => {
      console.log('数据库连接池已关闭')
      process.exit(0)
    })
  } else {
    process.exit(0)
  }
})

// 启动应用
async function startApp() {
  try {
    // 先初始化数据库
    await initDatabase()
    
    // 运行数据库迁移
    console.log('运行数据库迁移...')
    const { migrateDatabase } = require('./utils/db-migration')
    await migrateDatabase()
    
    // 然后启动服务器
    app.listen(PORT, () => {
      console.log(`KAS Backend Server 运行在端口 ${PORT}`)
      console.log(`API端点: http://localhost:${PORT}/api/login`)
    })
  } catch (err) {
    console.error('应用启动失败:', err)
    process.exit(1)
  }
}

startApp()