const express = require('express')
const { authenticator } = require('otplib')
const fs = require('fs')
const path = require('path')

const router = express.Router()

// 从环境变量获取配置
const TOTP_WINDOW = parseInt(process.env.TOTP_WINDOW || '1')
const TOTP_SECRET_LENGTH = parseInt(process.env.TOTP_SECRET_LENGTH || '32')

// 读取2FA数据库
function load2FADatabase() {
  try {
    // 从环境变量获取2FA数据库路径
    const dataDir = process.env.DATA_DIR || '../JSON'
    const dbPath = path.join(__dirname, dataDir, '2fabase.json')
    
    const data = fs.readFileSync(dbPath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('无法读取2FA数据库:', error)
    return []
  }
}

// TOTP验证路由
router.post('/login', (req, res) => {
  try {
    // 支持两种字段名格式：user/username 和 totppass
    const { user, username, totppass } = req.body
    const actualUser = user || username

    // 检查请求数据
    if (!actualUser || !totppass) {
      return res.status(401).json({
        success: false,
        message: '缺少用户名或验证码'
      })
    }

    // 验证码格式检查
    if (!/^\d{6}$/.test(totppass)) {
      return res.status(401).json({
        success: false,
        message: '验证码必须是6位数字'
      })
    }

    // 加载用户数据库
    const users = load2FADatabase()
    
    // 查找用户
    const userRecord = users.find(u => u.user === actualUser)
    
    if (!userRecord) {
      console.log(`用户未找到: ${actualUser}`)
      return res.status(403).json({
        success: false,
        message: '用户不存在'
      })
    }

    // 验证TOTP
    const isValid = authenticator.check(totppass, userRecord.totp_secret, { 
      window: TOTP_WINDOW
    })
    
    if (isValid) {
      console.log(`用户 ${actualUser} 登录成功`)
      return res.status(200).json({
        success: true,
        message: '验证成功',
        user: actualUser
      })
    } else {
      console.log(`用户 ${actualUser} TOTP验证失败`)
      return res.status(403).json({
        success: false,
        message: '验证码错误'
      })
    }

  } catch (error) {
    console.error('认证错误:', error)
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

module.exports = router