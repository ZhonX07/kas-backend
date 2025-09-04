const express = require('express')
const http = require('http')
const cors = require('cors')
const WebSocket = require('ws')

const app = express()
const PORT = process.env.PORT || 8080

// CORS配置
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

// 中间件配置
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
  next()
})

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Server is running'
  })
})

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: 'KAS Backend Test Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET  /health',
      'POST /login', 
      'GET  /api/reports/today/stats',
      'GET  /api/reports/today/details'
    ]
  })
})

// 登录端点
app.post('/login', (req, res) => {
  console.log('登录请求:', req.body)
  const { username, password, totp } = req.body
  
  // 简单验证
  if (username || password || totp) {
    res.json({
      success: true,
      message: '登录成功',
      user: { username: username || 'test' },
      token: 'test-token-' + Date.now()
    })
  } else {
    res.status(400).json({
      success: false,
      message: '请提供用户名、密码或TOTP'
    })
  }
})

// API登录端点（TOTP）
app.post('/api/login', (req, res) => {
  console.log('API登录请求:', req.body)
  const { totp } = req.body
  
  if (totp) {
    res.json({
      success: true,
      message: 'TOTP验证成功',
      token: 'totp-token-' + Date.now()
    })
  } else {
    res.status(400).json({
      success: false,
      message: 'TOTP不能为空'
    })
  }
})

// 模拟今日统计数据
app.get('/api/reports/today/stats', (req, res) => {
  console.log('获取今日统计数据')
  res.json({
    success: true,
    data: {
      total: Math.floor(Math.random() * 10) + 1,
      praise: Math.floor(Math.random() * 5) + 1,
      criticism: Math.floor(Math.random() * 3) + 1
    }
  })
})

// 模拟今日详细数据
app.get('/api/reports/today/details', (req, res) => {
  console.log('获取今日详细数据')
  
  const reports = []
  const reportCount = Math.floor(Math.random() * 5) + 1
  
  for (let i = 0; i < reportCount; i++) {
    const isAdd = Math.random() > 0.5
    reports.push({
      id: i + 1,
      class: `10${Math.floor(Math.random() * 9) + 1}`,
      isadd: isAdd,
      changescore: Math.floor(Math.random() * 5) + 1,
      note: isAdd ? 
        ['积极参与课堂讨论', '帮助同学', '主动打扫卫生', '拾金不昧'][Math.floor(Math.random() * 4)] :
        ['上课说话', '迟到', '作业未交', '违反纪律'][Math.floor(Math.random() * 4)],
      submitter: ['张老师', '李老师', '王老师', '赵老师'][Math.floor(Math.random() * 4)],
      submittime: new Date(Date.now() - Math.random() * 3600000).toISOString()
    })
  }
  
  const praise = reports.filter(r => r.isadd).length
  const criticism = reports.filter(r => !r.isadd).length
  
  res.json({
    success: true,
    data: {
      summary: {
        total: reports.length,
        praise: praise,
        criticism: criticism
      },
      allReports: reports.sort((a, b) => new Date(b.submittime) - new Date(a.submittime))
    }
  })
})

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err)
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  })
})

// 404处理
app.use('*', (req, res) => {
  console.log(`404 - 路由不存在: ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.originalUrl}`
  })
})

// 创建HTTP服务器
const server = http.createServer(app)

// 初始化WebSocket服务器
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
  console.log('📡 WebSocket客户端连接成功')
  
  ws.clientId = Date.now() + Math.random().toString(36).substr(2, 5)
  ws.isAlive = true
  
  // 处理客户端消息
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)
      console.log(`收到来自客户端 ${ws.clientId} 的消息:`, data)
      
      if (data.type === 'subscribe') {
        ws.subscribed = true
        ws.channels = data.channels || ['reports']
        
        ws.send(JSON.stringify({
          type: 'subscribed',
          channels: ws.channels,
          message: `已订阅频道: ${ws.channels.join(', ')}`
        }))
      }
    } catch (error) {
      console.error('WebSocket消息解析失败:', error)
    }
  })
  
  // 心跳检测
  ws.on('pong', () => {
    ws.isAlive = true
  })
  
  ws.on('close', () => {
    console.log(`📡 WebSocket客户端 ${ws.clientId} 已断开`)
  })
  
  ws.on('error', (error) => {
    console.error(`WebSocket客户端 ${ws.clientId} 错误:`, error)
  })
  
  // 发送连接确认消息
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: ws.clientId,
    message: '已连接到实时通报系统',
    time: new Date().toISOString()
  }))
})

// 定期检查WebSocket连接
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`关闭无响应的客户端 ${ws.clientId}`)
      return ws.terminate()
    }
    
    ws.isAlive = false
    ws.ping()
  })
}, 30000)

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 KAS 测试服务器启动成功!')
  console.log(`📍 HTTP服务: http://localhost:${PORT}`)
  console.log(`📡 WebSocket: ws://localhost:${PORT}`)
  console.log('📋 可用端点:')
  console.log('  GET  /health - 健康检查')
  console.log('  POST /login - 用户登录')
  console.log('  POST /api/login - TOTP登录')
  console.log('  GET  /api/reports/today/stats - 今日统计')
  console.log('  GET  /api/reports/today/details - 今日详情')
  console.log('\n🔄 服务器正在运行，等待连接...')
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 收到停止信号，正在关闭服务器...')
  clearInterval(pingInterval)
  wss.close(() => {
    server.close(() => {
      console.log('✅ 服务器已关闭')
      process.exit(0)
    })
  })
})

module.exports = server