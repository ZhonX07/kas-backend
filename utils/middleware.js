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

module.exports = {
  asyncHandler,
  validateRequired,
  requireDatabase
}