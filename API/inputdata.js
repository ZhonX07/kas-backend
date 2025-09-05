const express = require('express')
const router = express.Router()
const dbAdapter = require('../utils/db-adapter')
const { getHeadteacher } = require('../utils/headteachers')

console.log('📝 加载 inputdata 路由模块...')

// 提交通报数据 - 确保路由路径正确
router.post('/api/inputdata', async (req, res) => {
  console.log('📝 收到通报提交请求:', req.body)
  console.log('📍 请求路径:', req.originalUrl)
  
  try {
    const { class: classNum, isadd, changescore, note, submitter, reducetype } = req.body

    // 验证必需字段
    if (!classNum || isadd === undefined || !changescore || !note || !submitter) {
      console.log('❌ 缺少必需字段:', { classNum, isadd, changescore, note, submitter })
      return res.status(400).json({
        success: false,
        message: '缺少必需字段',
        received: { classNum, isadd, changescore, note, submitter }
      })
    }

    // 验证数据范围
    if (changescore < 1 || changescore > 20) {
      return res.status(400).json({
        success: false,
        message: '分数必须在1-20之间'
      })
    }

    // 准备要插入的数据
    const reportData = {
      class: parseInt(classNum),
      isadd,
      changescore: parseInt(changescore),
      note,
      submitter,
      reducetype: !isadd ? reducetype : undefined // 只有违纪才有违纪类型
    }

    console.log('💾 准备插入数据:', reportData)

    // 使用数据库适配器添加报告
    const result = await dbAdapter.addReport(reportData)

    console.log(`✅ 数据已插入, 记录ID: ${result.id}, 月份分区: ${result.database}`)

    res.json({
      success: true,
      message: '数据提交成功',
      data: {
        id: result.id,
        database: result.database,
        submittime: result.submittime,
        class: reportData.class,
        headteacher: getHeadteacher(reportData.class)
      }
    })
  } catch (error) {
    console.error('❌ 数据提交错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    })
  }
})

// 调试路由 - 列出所有注册的路由
router.get('/api/debug/routes', (req, res) => {
  res.json({
    success: true,
    message: 'inputdata 路由模块已加载',
    routes: [
      'POST /api/inputdata - 提交通报数据',
      'GET /api/debug/routes - 调试信息'
    ],
    timestamp: new Date().toISOString()
  })
})

console.log('✅ inputdata 路由模块加载完成')
module.exports = router
})

// 查询接口 - 获取特定日期的通报 - 修复路径参数
router.get('/reports/date/:date', async (req, res) => {
  try {
    const { date } = req.params

    // 验证日期格式 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: '日期格式错误，请使用 YYYY-MM-DD 格式'
      })
    }

    // 使用数据库适配器获取报告
    const reports = await dbAdapter.getReportsByDate(date)

    res.json({
      success: true,
      data: reports
    })
  } catch (error) {
    console.error('获取日期报告错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 查询接口 - 获取特定日期和班级的通报 - 修复路径参数
router.get('/reports/date/:date/class/:classNum', async (req, res) => {
  try {
    const { date, classNum } = req.params

    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: '日期格式错误，请使用 YYYY-MM-DD 格式'
      })
    }

    // 验证班级号
    if (!classNum || isNaN(parseInt(classNum))) {
      return res.status(400).json({
        success: false,
        message: '班级号格式错误'
      })
    }

    // 使用数据库适配器获取报告
    const reports = await dbAdapter.getReportsByDateAndClass(date, classNum)

    res.json({
      success: true,
      data: reports
    })
  } catch (error) {
    console.error('获取班级日期报告错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 查询接口 - 获取特定班级在日期范围内的通报 - 修复路径参数
router.get('/reports/class/:classNum/range/:startDate/:endDate', async (req, res) => {
  try {
    const { classNum, startDate, endDate } = req.params

    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: '日期格式错误，请使用 YYYY-MM-DD 格式'
      })
    }

    // 验证班级号
    if (!classNum || isNaN(parseInt(classNum))) {
      return res.status(400).json({
        success: false,
        message: '班级号格式错误'
      })
    }

    // 验证日期范围
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: '开始日期不能大于结束日期'
      })
    }

    // 使用数据库适配器获取报告
    const reports = await dbAdapter.getReportsByClassAndDateRange(classNum, startDate, endDate)

    res.json({
      success: true,
      data: reports
    })
  } catch (error) {
    console.error('获取班级范围报告错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

module.exports = router
