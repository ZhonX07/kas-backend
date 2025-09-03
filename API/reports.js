const express = require('express')
const { 
  addReport, 
  getReportsByMonth, 
  getReportsByDate, 
  getReportsByDateAndClass, 
  getReportsByClassAndDateRange 
} = require('../utils/db-adapter')
const { asyncHandler, validateRequired, requireDatabase } = require('../utils/middleware')

const router = express.Router()

// 获取今日统计数据 - 专门为Overview页面设计
router.get('/reports/today/stats', requireDatabase, asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD格式
  
  const client = await global.dbContext.instance.connect()
  
  try {
    // 1. 获取今日所有通报
    const allReports = await client.query(`
      SELECT 
        class,
        isadd,
        changescore,
        note,
        submitter,
        submittime
      FROM reports 
      WHERE date_partition = $1
      ORDER BY submittime DESC
    `, [today])
    
    const reports = allReports.rows
    
    // 2. 统计总数
    const total = reports.length
    const positive = reports.filter(r => r.isadd).length
    const negative = reports.filter(r => !r.isadd).length
    
    // 3. 活跃班级数量
    const activeClasses = [...new Set(reports.map(r => r.class))].length
    
    // 4. 按类型统计（根据分数范围分类）
    const typeStats = {}
    reports.forEach(report => {
      const score = report.changescore
      let type
      
      if (report.isadd) {
        if (score >= 5) type = '重大表扬'
        else if (score >= 3) type = '表扬'
        else type = '小表扬'
      } else {
        if (score >= 5) type = '重大违纪'
        else if (score >= 3) type = '违纪'
        else type = '小违纪'
      }
      
      typeStats[type] = (typeStats[type] || 0) + 1
    })
    
    // 5. 班级排行（按今日总分排序）
    const classStats = {}
    reports.forEach(report => {
      if (!classStats[report.class]) {
        classStats[report.class] = {
          class: report.class,
          totalScore: 0,
          reportCount: 0,
          positiveCount: 0,
          negativeCount: 0
        }
      }
      
      const stat = classStats[report.class]
      stat.reportCount++
      
      if (report.isadd) {
        stat.totalScore += report.changescore
        stat.positiveCount++
      } else {
        stat.totalScore -= report.changescore
        stat.negativeCount++
      }
    })
    
    const classRanking = Object.values(classStats)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10) // 只返回前10名
    
    // 6. 最新通报（最近5条）
    const recentReports = reports.slice(0, 5).map(report => ({
      id: report.id,
      class: report.class,
      type: report.isadd ? '加分' : '扣分',
      score: report.changescore,
      note: report.note,
      submitter: report.submitter,
      time: report.submittime
    }))
    
    res.json({
      success: true,
      data: {
        date: today,
        summary: {
          total,
          positive,
          negative,
          activeClasses
        },
        typeStats,
        classRanking,
        recentReports,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('获取今日统计失败:', error)
    res.status(500).json({
      success: false,
      message: '获取今日统计失败'
    })
  } finally {
    client.release()
  }
}))

// 获取特定日期的通报
router.get('/reports/date/:date', requireDatabase, asyncHandler(async (req, res) => {
  const { date } = req.params
  
  try {
    const reports = await getReportsByDate(date)
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取通报失败'
    })
  }
}))

// 获取特定日期和班级的通报
router.get('/reports/date/:date/class/:classNum', requireDatabase, asyncHandler(async (req, res) => {
  const { date, classNum } = req.params
  
  try {
    const reports = await getReportsByDateAndClass(date, classNum)
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取通报失败'
    })
  }
}))

// 获取特定月份的通报
router.get('/reports/:yearMonth', requireDatabase, asyncHandler(async (req, res) => {
  const { yearMonth } = req.params
  
  try {
    const reports = await getReportsByMonth(yearMonth)
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取通报失败'
    })
  }
}))

// 获取班级在日期范围内的通报
router.get('/reports/class/:classNum/range/:startDate/:endDate', requireDatabase, asyncHandler(async (req, res) => {
  const { classNum, startDate, endDate } = req.params
  
  try {
    const reports = await getReportsByClassAndDateRange(classNum, startDate, endDate)
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取通报失败'
    })
  }
}))

module.exports = router