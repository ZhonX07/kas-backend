const express = require('express')
const { 
  addReport, 
  getReportsByMonth, 
  getReportsByDate, 
  getReportsByDateAndClass, 
  getReportsByClassAndDateRange 
} = require('../utils/db-adapter')
const { asyncHandler, validateRequired, requireDatabase } = require('../utils/middleware')
const { getHeadteacher, getAllClasses } = require('../utils/headteachers')
const { broadcastReport } = require('../websocket')

const router = express.Router()

// 获取所有班级列表（包含班主任信息）- 放在最前面
router.get('/classes', asyncHandler(async (req, res) => {
  try {
    const classes = getAllClasses()
    
    res.json({
      success: true,
      data: classes
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取班级列表失败'
    })
  }
}))

// 获取历史记录（按班级和日期范围查询）- 放在具体路由前面
router.get('/reports/history', requireDatabase, asyncHandler(async (req, res) => {
  const { classId, startDate, endDate, isadd, minScore, maxScore } = req.query
  
  try {
    const client = await global.dbContext.instance.connect()
    
    // 构建查询条件
    let whereConditions = []
    let queryParams = []
    let paramIndex = 1
    
    // 班级筛选
    if (classId && classId !== 'all') {
      whereConditions.push(`class = $${paramIndex}`)
      queryParams.push(parseInt(classId))
      paramIndex++
    }
    
    // 日期范围筛选
    if (startDate && endDate) {
      whereConditions.push(`date_partition BETWEEN $${paramIndex}::date AND $${paramIndex + 1}::date`)
      queryParams.push(startDate, endDate)
      paramIndex += 2
    }
    
    // 加分/扣分筛选
    if (isadd !== undefined && isadd !== 'all') {
      whereConditions.push(`isadd = $${paramIndex}`)
      queryParams.push(isadd === 'true')
      paramIndex++
    }
    
    // 分数范围筛选
    if (minScore) {
      whereConditions.push(`changescore >= $${paramIndex}`)
      queryParams.push(parseInt(minScore))
      paramIndex++
    }
    
    if (maxScore) {
      whereConditions.push(`changescore <= $${paramIndex}`)
      queryParams.push(parseInt(maxScore))
      paramIndex++
    }
    
    // 构建完整查询
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
    
    // 检查表是否包含 reducetype 字段
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'reports' AND column_name = 'reducetype'
    `)
    
    const hasReduceType = columnCheck.rows.length > 0
    
    const query = `
      SELECT 
        id,
        class,
        isadd,
        changescore,
        note,
        submitter,
        submittime,
        date_partition${hasReduceType ? ',\n        reducetype' : ''}
      FROM reports 
      ${whereClause}
      ORDER BY submittime DESC
      LIMIT 1000
    `
    
    console.log('执行历史记录查询:', query, queryParams)
    
    const result = await client.query(query, queryParams)
    
    // 为每条记录注入班主任信息和违纪类型显示
    const reports = result.rows.map(report => ({
      ...report,
      headteacher: getHeadteacher(report.class),
      type: report.isadd ? '表彰' : getViolationType(report.reducetype),
      scoreDisplay: report.isadd ? `+${report.changescore}` : `-${report.changescore}`
    }))
    
    // 统计信息
    const stats = {
      total: reports.length,
      praise: reports.filter(r => r.isadd).length,
      criticism: reports.filter(r => !r.isadd).length,
      totalPraiseScore: reports.filter(r => r.isadd).reduce((sum, r) => sum + r.changescore, 0),
      totalCriticismScore: reports.filter(r => !r.isadd).reduce((sum, r) => sum + r.changescore, 0),
      classCount: new Set(reports.map(r => r.class)).size
    }
    
    client.release()
    
    res.json({
      success: true,
      data: {
        reports,
        stats,
        query: {
          classId: classId || 'all',
          startDate,
          endDate,
          isadd: isadd || 'all',
          minScore,
          maxScore
        }
      }
    })
    
  } catch (error) {
    console.error('获取历史记录失败:', error)
    res.status(500).json({
      success: false,
      message: '获取历史记录失败: ' + error.message
    })
  }
}))

// 获取今日统计数据 - 专门为Overview页面设计
router.get('/reports/today/stats', requireDatabase, asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD格式
  
  const client = await global.dbContext.instance.connect()
  
  try {
    // 1. 获取今日所有通报
    const allReports = await client.query(`
      SELECT 
        id,
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
    
    const reports = allReports.rows.map(report => ({
      ...report,
      headteacher: getHeadteacher(report.class) // 注入班主任信息
    }))
    
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
          headteacher: report.headteacher,
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
      headteacher: report.headteacher,
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
        allReports: reports, // 包含完整的通报数据
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

// 获取今日明细数据 - 返回完整的通报列表  
router.get('/reports/today/details', requireDatabase, asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD格式
  
  const client = await global.dbContext.instance.connect()
  
  try {
    // 获取今日所有通报明细
    const allReports = await client.query(`
      SELECT 
        id,
        class,
        isadd,
        changescore,
        note,
        submitter,
        submittime,
        date_partition
      FROM reports 
      WHERE date_partition = $1
      ORDER BY submittime DESC
    `, [today])
    
    // 为每条通报注入班主任信息并格式化数据
    const detailReports = allReports.rows.map(report => ({
      id: report.id,
      class: report.class,
      headteacher: getHeadteacher(report.class),
      type: report.isadd ? '表彰' : '违纪',
      nature: report.isadd ? 'praise' : 'criticism',
      score: report.isadd ? report.changescore : -report.changescore,
      actualScore: report.changescore, // 原始分数（用于后端计算）
      note: report.note,
      submitter: report.submitter,
      submittime: report.submittime,
      date: report.date_partition,
      // 根据分数范围确定类型级别
      level: (() => {
        const score = report.changescore
        if (report.isadd) {
          if (score >= 5) return '重大表彰'
          else if (score >= 3) return '表彰'
          else return '小表彰'
        } else {
          if (score >= 5) return '重大违纪'
          else if (score >= 3) return '违纪'
          else return '小违纪'
        }
      })()
    }))
    
    // 按类型分类
    const praiseReports = detailReports.filter(r => r.nature === 'praise')
    const criticismReports = detailReports.filter(r => r.nature === 'criticism')
    
    // 统计信息
    const summary = {
      total: detailReports.length,
      praise: praiseReports.length,
      criticism: criticismReports.length,
      totalPraiseScore: praiseReports.reduce((sum, r) => sum + r.actualScore, 0),
      totalCriticismScore: criticismReports.reduce((sum, r) => sum + r.actualScore, 0),
      activeClasses: [...new Set(detailReports.map(r => r.class))].length
    }
    
    res.json({
      success: true,
      data: {
        date: today,
        summary,
        allReports: detailReports,
        praiseReports,
        criticismReports
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('获取今日明细失败:', error)
    res.status(500).json({
      success: false,
      message: '获取今日明细失败'
    })
  } finally {
    client.release()
  }
}))

// 获取特定日期的通报 - 简化路径参数格式
router.get('/reports/date/:date', requireDatabase, asyncHandler(async (req, res) => {
  const { date } = req.params
  
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: '日期格式错误，请使用 YYYY-MM-DD 格式'
    })
  }
  
  try {
    const reports = await getReportsByDate(date)
    
    // 为每条通报注入班主任信息
    const reportsWithTeachers = reports.map(report => ({
      ...report,
      headteacher: getHeadteacher(report.class)
    }))
    
    // 计算统计数据
    const total = reportsWithTeachers.length
    const positive = reportsWithTeachers.filter(r => r.isadd).length
    const negative = reportsWithTeachers.filter(r => !r.isadd).length
    const activeClasses = [...new Set(reportsWithTeachers.map(r => r.class))].length
    
    // 按类型统计
    const typeStats = {}
    reportsWithTeachers.forEach(report => {
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
    
    // 班级排行
    const classStats = {}
    reportsWithTeachers.forEach(report => {
      if (!classStats[report.class]) {
        classStats[report.class] = {
          class: report.class,
          headteacher: report.headteacher,
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
    
    // 最新通报
    const recentReports = reportsWithTeachers
      .sort((a, b) => new Date(b.submittime) - new Date(a.submittime))
      .slice(0, 5)
      .map(report => ({
        id: report.id,
        class: report.class,
        headteacher: report.headteacher,
        type: report.isadd ? '加分' : '扣分',
        score: report.changescore,
        note: report.note,
        submitter: report.submitter,
        time: report.submittime
      }))
    
    res.json({
      success: true,
      data: reportsWithTeachers,
      count: reportsWithTeachers.length,
      summary: {
        total,
        positive,
        negative,
        activeClasses
      },
      typeStats,
      classRanking,
      recentReports
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取通报失败'
    })
  }
}))

// 获取特定日期和班级的通报 - 简化路径参数格式
router.get('/reports/date/:date/class/:classNum', requireDatabase, asyncHandler(async (req, res) => {
  const { date, classNum } = req.params
  
  // 验证参数格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: '日期格式错误，请使用 YYYY-MM-DD 格式'
    })
  }
  
  if (!/^\d+$/.test(classNum)) {
    return res.status(400).json({
      success: false,
      message: '班级号必须是数字'
    })
  }
  
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

// 获取班级在日期范围内的通报 - 简化路径参数格式
router.get('/reports/class/:classNum/range/:startDate/:endDate', requireDatabase, asyncHandler(async (req, res) => {
  const { classNum, startDate, endDate } = req.params
  
  // 验证参数格式
  if (!/^\d+$/.test(classNum)) {
    return res.status(400).json({
      success: false,
      message: '班级号必须是数字'
    })
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({
      success: false,
      message: '日期格式错误，请使用 YYYY-MM-DD 格式'
    })
  }
  
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

// 获取特定月份的通报 - 简化路径参数，移到最后
router.get('/reports/:yearMonth', requireDatabase, asyncHandler(async (req, res) => {
  const { yearMonth } = req.params
  
  // 验证年月格式 (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return res.status(400).json({
      success: false,
      message: '年月格式错误，请使用 YYYY-MM 格式'
    })
  }
  
  try {
    const reports = await getReportsByMonth(yearMonth)
    
    res.json({
      success: true,
      data: reports,
      count: reports.length
    })
  } catch (error) {
    console.error('获取月份通报失败:', error)
    res.status(500).json({
      success: false,
      message: '获取通报失败: ' + error.message
    })
  }
}))

// 示例：在提交报告的路由中添加广播功能
router.post('/submit', async (req, res) => {
  try {
    // ...existing submission logic...
    
    // 假设提交成功后有一个newReport对象
    // broadcastReport(newReport)
    
    // ...existing response logic...
  } catch (error) {
    // ...existing error handling...
  }
})

// 辅助函数：获取违纪类型显示文本
function getViolationType(reducetype) {
  if (!reducetype) return '违纪'
  
  switch (reducetype) {
    case 'discipline':
      return '纪律违纪'
    case 'hygiene':
      return '卫生违纪'
    default:
      return '违纪'
  }
}

module.exports = router