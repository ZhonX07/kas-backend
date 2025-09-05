const express = require('express')
const router = express.Router()
const dbAdapter = require('../utils/db-adapter')
const { getHeadteacher } = require('../utils/headteachers')

// 提交通报数据
router.post('/inputdata', async (req, res) => {
  try {
    const { class: classNum, isadd, changescore, note, submitter } = req.body

    // 验证必需字段
    if (!classNum || isadd === undefined || !changescore || !note || !submitter) {
      return res.status(400).json({
        success: false,
        message: '缺少必需字段'
      })
    }

    // 使用数据库适配器添加报告
    const result = await dbAdapter.addReport({
      class: classNum,
      isadd,
      changescore,
      note,
      submitter
    })

    console.log(`数据已插入, 记录ID: ${result.id}, 月份分区: ${result.database}`)

    res.json({
      success: true,
      message: '数据提交成功',
      id: result.id,
      database: result.database,
      submittime: result.submittime
    })
  } catch (error) {
    console.error('数据提交错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
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
router.get('/reports/date/:date([0-9]{4}-[0-9]{2}-[0-9]{2})', async (req, res) => {
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
router.get('/reports/date/:date([0-9]{4}-[0-9]{2}-[0-9]{2})/class/:classNum([0-9]+)', async (req, res) => {
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
router.get('/reports/class/:classNum([0-9]+)/range/:startDate([0-9]{4}-[0-9]{2}-[0-9]{2})/:endDate([0-9]{4}-[0-9]{2}-[0-9]{2})', async (req, res) => {
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
