/**
 * 异步路由错误处理包装器
 * 自动捕获异步路由中的错误并传递给错误处理中间件
 */

// 异步路由包装器
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 验证必需参数的中间件
function validateRequired(fields) {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field] || req.params[field] || req.query[field]
      return value === undefined || value === null || value === ''
    })
    
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `缺少必需参数: ${missing.join(', ')}`
      })
    }
    
    next()
  }
}

// 数据库连接检查中间件
function requireDatabase(req, res, next) {
  if (!global.dbContext || !global.dbContext.isReady) {
    return res.status(503).json({
      success: false,
      message: '数据库连接未就绪'
    })
  }
  next()
}

// CORS中间件 - 从环境变量获取配置
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin
  
  // 从环境变量获取允许的域名列表
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173']
  
  // 检查是否为允许的域名或本地开发环境
  if (!origin || 
      allowedOrigins.includes(origin) || 
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
    
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Credentials', process.env.CORS_CREDENTIALS || 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin')
  }
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
}

module.exports = {
  asyncHandler,
  validateRequired,
  requireDatabase,
  corsMiddleware
}