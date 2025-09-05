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

// API路由注册 - 确保正确的顺序和路径
app.use('/api', require('./API/inputdata'))  // 处理 /api/inputdata
app.use('/api', require('./API/reports'))    // 处理其他报告相关路由

// 创建HTTP服务器
const server = http.createServer(app)

// 初始化WebSocket服务
initWebSocket(server)

// 修改监听方式，使用HTTP服务器而不是Express
const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})