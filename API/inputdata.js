const express = require('express')
const router = express.Router()
const dbAdapter = require('../utils/db-adapter')
const { getHeadteacher } = require('../utils/headteachers')
const { broadcastReport } = require('../websocket')

console.log('📝 加载 inputdata 路由模块...')

// 提交通报数据 - 修正路由路径，移除前导的 /api 
router.post('/inputdata', async (req, res) => {
  console.log('📝 收到通报提交请求:', req.body)
  
  try {
    const { class: classNum, isadd, changescore, note, submitter, reducetype } = req.body
    
    // 验证必需字段
    if (!classNum || isadd === undefined || !changescore || !note || !submitter) {
      console.log('❌ 缺少必需字段:', { classNum, isadd, changescore, note, submitter })
      return res.status(400).json({
        success: false,
        message: '缺少必需字段',
        required: ['class', 'isadd', 'changescore', 'note', 'submitter'],
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

    // 验证班级号
    if (classNum < 1 || classNum > 100) {
      return res.status(400).json({
        success: false,
        message: '班级号无效'
      })
    }

    // 检查数据库连接
    if (!global.dbContext || !global.dbContext.isReady) {
      console.error('❌ 数据库连接未就绪')
      return res.status(503).json({
        success: false,
        message: '数据库服务不可用'
      })
    }

    // 准备数据插入
    const reportData = {
      class: parseInt(classNum),
      isadd: Boolean(isadd),
      changescore: parseInt(changescore),
      note: String(note).trim(),
      submitter: String(submitter).trim(),
      reducetype: reducetype || null
    }

    console.log('💾 准备插入数据库:', reportData)

    // 调用数据库适配器添加报告
    const result = await dbAdapter.addReport(reportData)
    
    console.log('✅ 数据插入成功, 记录ID:', result.id)

    // 准备广播数据
    const newReport = {
      id: result.id,
      class: reportData.class,
      headteacher: getHeadteacher(reportData.class),
      isadd: reportData.isadd,
      changescore: reportData.changescore,
      note: reportData.note,
      submitter: reportData.submitter,
      submittime: result.submittime || new Date().toISOString(),
      reducetype: reportData.reducetype
    }

    // 广播新通报给所有WebSocket客户端
    const broadcastCount = broadcastReport(newReport, 'reports')
    console.log(`📡 已向 ${broadcastCount} 个客户端广播新通报`)

    res.json({
      success: true,
      message: '通报提交成功',
      data: {
        id: result.id,
        database: result.database || new Date().toISOString().slice(0, 7),
        submittime: result.submittime || new Date().toISOString(),
        class: reportData.class,
        headteacher: getHeadteacher(reportData.class),
        broadcastCount
      }
    })

  } catch (error) {
    console.error('❌ 提交通报失败:', error)
    
    let errorMessage = '提交通报失败'
    let statusCode = 500
    
    if (error.message?.includes('pool')) {
      errorMessage = '数据库连接池错误，请检查数据库配置'
    } else if (error.message?.includes('connect')) {
      errorMessage = '无法连接到数据库'
    } else if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      errorMessage = '数据库表不存在，请检查数据库初始化'
    } else {
      errorMessage = error.message || '未知错误'
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// 调试路由 - 修正路径
router.get('/debug/routes', (req, res) => {
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

// 查询接口 - 获取特定月份的通报 - 修复路径参数
router.get('/reports/:yearMonth([0-9]{4}-[0-9]{2})', async (req, res) => {
  try {
    const { yearMonth } = req.params

    // 使用数据库适配器获取报告
    const reports = await dbAdapter.getReportsByMonth(yearMonth)

    res.json({
      success: true,
      data: reports
    })
  } catch (error) {
    console.error('获取报告错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
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

console.log('✅ inputdata 路由模块加载完成')
module.exports = router
