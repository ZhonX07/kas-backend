const express = require('express')
const router = express.Router()
const db = require('../db')

// 获取日期范围的辅助函数
function getTodayDateRange() {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return { todayStart, todayEnd }
}

// 格式化日期为MySQL DATETIME格式
function formatDateForMySQL(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

// 获取今日明细数据
router.get('/today-details', async (req, res) => {
  try {
    // 获取当天日期范围
    const { todayStart, todayEnd } = getTodayDateRange()
    
    console.log(`📊 获取今日明细数据: ${todayStart.toISOString()} - ${todayEnd.toISOString()}`)
    
    // 查询今日所有通报记录
    const query = `
      SELECT 
        r.id,
        r.class,
        c.headteacher,
        r.isadd,
        r.changescore as actualScore,
        r.note,
        r.submitter,
        r.submittime,
        CASE 
          WHEN r.isadd = 1 THEN 'praise'
          ELSE 'criticism'
        END as nature,
        CASE 
          WHEN r.isadd = 1 AND r.changescore >= 10 THEN '重大表彰'
          WHEN r.isadd = 1 AND r.changescore >= 5 THEN '表彰'
          WHEN r.isadd = 1 THEN '小表彰'
          WHEN r.isadd = 0 AND r.changescore >= 10 THEN '重大违纪'
          WHEN r.isadd = 0 AND r.changescore >= 5 THEN '违纪'
          ELSE '小违纪'
        END as level,
        SUBSTRING_INDEX(r.note, ' - ', 1) as type
      FROM reportform r
      LEFT JOIN class c ON r.class = c.class
      WHERE r.submittime >= ? AND r.submittime < ?
      ORDER BY r.submittime DESC
    `
    
    const [allReports] = await db.execute(query, [todayStart, todayEnd])
    
    // 统计汇总数据
    const summary = {
      total: allReports.length,
      praise: allReports.filter(r => r.nature === 'praise').length,
      criticism: allReports.filter(r => r.nature === 'criticism').length,
      activeClasses: new Set(allReports.map(r => r.class)).size
    }
    
    // 按类型统计
    const typeStats = {}
    allReports.forEach(report => {
      const type = report.type || '其他'
      typeStats[type] = (typeStats[type] || 0) + 1
    })
    
    // 按班级统计得分
    const classStats = {}
    allReports.forEach(report => {
      if (!classStats[report.class]) {
        classStats[report.class] = {
          class: report.class,
          headteacher: report.headteacher,
          totalScore: 0,
          reportCount: 0,
          praiseCount: 0,
          criticismCount: 0
        }
      }
      
      const stats = classStats[report.class]
      stats.reportCount++
      
      if (report.nature === 'praise') {
        stats.totalScore += report.actualScore
        stats.praiseCount++
      } else {
        stats.totalScore -= report.actualScore
        stats.criticismCount++
      }
    })
    
    const response = {
      success: true,
      data: {
        summary,
        allReports: allReports.map(report => ({
          id: report.id,
          class: report.class,
          headteacher: report.headteacher,
          nature: report.nature,
          level: report.level,
          type: report.type,
          actualScore: report.actualScore,
          note: report.note,
          submitter: report.submitter,
          submittime: report.submittime
        })),
        typeStats,
        classStats: Object.values(classStats).sort((a, b) => b.totalScore - a.totalScore)
      }
    }
    
    console.log(`✅ 今日明细数据获取成功: 共${allReports.length}条记录`)
    res.json(response)
    
  } catch (error) {
    console.error('❌ 获取今日明细数据失败:', error)
    res.status(500).json({
      success: false,
      message: '获取今日明细数据失败',
      error: error.message
    })
  }
})

module.exports = router