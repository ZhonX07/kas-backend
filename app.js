const http = require('http')
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')

// 引入WebSocket模块
const { initWebSocket } = require('./websocket')

const app = express()

// CORS配置
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

app.use(bodyParser.json())

// 登录路由
app.post('/login', (req, res) => {
  console.log('Login request received:', req.body)
  const { username, password } = req.body
  
  // 简单的登录验证示例
  if (username && password) {
    res.json({
      success: true,
      message: '登录成功',
      user: { username },
      token: 'fake-jwt-token-' + Date.now()
    })
  } else {
    res.status(400).json({
      success: false,
      message: '用户名或密码不能为空'
    })
  }
})

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'KAS Backend'
  })
})

// API路由注册 - 修复路由注册顺序和路径
console.log('📝 注册API路由...')

// 添加请求日志中间件
app.use((req, res, next) => {
  console.log(`🌐 收到请求: ${req.method} ${req.originalUrl}`)
  next()
})

// 修正输入数据路由注册 - 挂载在 /api 前缀下
try {
  const inputDataRouter = require('./API/inputdata')
  app.use('/api', inputDataRouter)  // 将路由挂载到 /api 前缀下
  console.log('✅ inputdata 路由已注册在 /api 前缀下')
} catch (error) {
  console.error('❌ inputdata 路由注册失败:', error)
}

// 再注册其他报告相关路由
try {
  const reportsRouter = require('./API/reports')
  app.use('/api', reportsRouter)    // 处理其他报告相关路由
  console.log('✅ reports 路由已注册')
} catch (error) {
  console.error('❌ reports 路由注册失败:', error)
}

console.log('✅ API路由注册完成')

// 移除通用调试中间件，它会干扰路由匹配
// app.use('*', (req, res, next) => {
//   console.log(`🌐 收到请求: ${req.method} ${req.originalUrl}`)
//   next()
// })

// 添加路由调试中间件 - 只处理未匹配的API路由
app.use('/api/*', (req, res, next) => {
  console.log(`❌ 未匹配的API路由: ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    success: false,
    message: '路由不存在',
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      'POST /api/inputdata',
      'GET /api/classes',
      'GET /api/reports/today/stats',
      'GET /api/reports/today/details',
      'GET /api/debug/routes'
    ]
  })
})

// 创建HTTP服务器
const server = http.createServer(app)

// 初始化WebSocket服务
initWebSocket(server)

// 修改监听方式，使用HTTP服务器而不是Express
const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})