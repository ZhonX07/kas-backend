const express = require('express')
const router = express.Router()
const dbAdapter = require('../utils/db-adapter')

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

// 查询接口 - 获取特定月份的通报
router.get('/reports/:yearMonth', async (req, res) => {
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

module.exports = router
