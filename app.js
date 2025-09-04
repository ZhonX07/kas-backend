const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')

// 引入WebSocket模块
const { initWebSocket } = require('./websocket')

const app = express()
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

// 创建HTTP服务器
const server = http.createServer(app)

// 初始化WebSocket服务
initWebSocket(server)

// 修改监听方式，使用HTTP服务器而不是Express
const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})