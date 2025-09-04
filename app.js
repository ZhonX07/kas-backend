const http = require('http')

// 引入WebSocket模块
const { initWebSocket } = require('./websocket')

// 创建HTTP服务器
const server = http.createServer(app)

// 初始化WebSocket服务
initWebSocket(server)

// 修改监听方式，使用HTTP服务器而不是Express
const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})