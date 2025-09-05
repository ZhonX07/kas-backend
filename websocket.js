const WebSocket = require('ws')

let wss = null

const pingInterval = parseInt(process.env.WS_PING_INTERVAL || '30000')
const maxClients = parseInt(process.env.WS_MAX_CLIENTS || '100')

// 初始化WebSocket服务器
function initWebSocket(server) {
  wss = new WebSocket.Server({ 
    server,
    maxClients: maxClients
  })
  
  wss.on('connection', (ws) => {
    console.log('📡 WebSocket客户端已连接')
    
    // 设置客户端标识
    ws.clientId = Date.now() + Math.random().toString(36).substr(2, 5)
    ws.isAlive = true
    
    // 心跳检测
    ws.on('pong', () => {
      ws.isAlive = true
    })
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message)
        console.log(`📨 收到来自客户端 ${ws.clientId} 的消息:`, data)
        
        // 处理客户端消息
        if (data.type === 'subscribe') {
          ws.subscribed = true
          ws.channels = data.channels || ['reports']
          
          // 发送确认消息
          ws.send(JSON.stringify({
            type: 'subscribed',
            channels: ws.channels,
            message: `已订阅频道: ${ws.channels.join(', ')}`
          }))
          
          console.log(`✅ 客户端 ${ws.clientId} 已订阅频道: ${ws.channels.join(', ')}`)
        }
      } catch (error) {
        console.error('❌ 解析WebSocket消息失败:', error)
      }
    })
    
    ws.on('close', () => {
      console.log(`📡 WebSocket客户端 ${ws.clientId} 已断开`)
    })
    
    ws.on('error', (error) => {
      console.error(`❌ WebSocket客户端 ${ws.clientId} 错误:`, error)
    })
    
    // 发送初始连接消息
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: ws.clientId,
      message: '已连接到实时通报系统',
      time: new Date().toISOString()
    }))
  })
  
  // 定期检查WebSocket连接
  const pingIntervalId = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`🔌 关闭无响应的客户端 ${ws.clientId}`)
        return ws.terminate()
      }
      
      ws.isAlive = false
      ws.ping()
    })
  }, pingInterval)

  // 服务器关闭时清理
  wss.on('close', () => {
    clearInterval(pingIntervalId)
  })
  
  console.log('📡 WebSocket服务器已初始化')
  return wss
}

// 向所有订阅的客户端广播消息
function broadcastReport(report, channel = 'reports') {
  if (!wss) {
    console.warn('⚠️  WebSocket服务器未初始化，无法广播消息')
    return 0
  }
  
  console.log(`📢 广播 ${channel} 消息到所有客户端:`, report)
  
  const message = JSON.stringify({
    type: 'new-report',
    channel,
    data: report,
    time: new Date().toISOString()
  })
  
  let sentCount = 0
  
  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN && 
      client.subscribed && 
      (!client.channels || client.channels.includes(channel))
    ) {
      try {
        client.send(message)
        sentCount++
      } catch (error) {
        console.error(`❌ 发送消息到客户端 ${client.clientId} 失败:`, error)
      }
    }
  })
  
  console.log(`✅ 消息已发送给 ${sentCount} 个客户端`)
  return sentCount
}

// 向特定客户端发送消息
function sendToClient(clientId, message) {
  if (!wss) return false
  
  let sent = false
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.clientId === clientId) {
      client.send(JSON.stringify(message))
      sent = true
    }
  })
  
  return sent
}

// 获取连接的客户端数量
function getConnectedClientsCount() {
  if (!wss) return 0
  return [...wss.clients].filter(client => client.readyState === WebSocket.OPEN).length
}

module.exports = {
  initWebSocket,
  broadcastReport,
  sendToClient,
  getConnectedClientsCount
}