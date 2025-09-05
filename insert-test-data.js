/**
 * 测试数据插入脚本
 * 为系统生成一些测试数据
 */

require('dotenv').config()
const { Pool } = require('pg')

const testData = [
  { class: 1, isadd: true, changescore: 5, note: '积极参与课堂讨论', submitter: '李晓鹏' },
  { class: 1, isadd: false, changescore: 3, note: '课堂玩手机', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 2, isadd: true, changescore: 3, note: '帮助同学解题', submitter: '李晓鹏' },
  { class: 2, isadd: false, changescore: 2, note: '迟到5分钟', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 3, isadd: true, changescore: 4, note: '作业完成质量高', submitter: '李晓鹏' },
  { class: 3, isadd: false, changescore: 5, note: '课堂睡觉', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 4, isadd: true, changescore: 2, note: '主动清洁教室', submitter: '李晓鹏' },
  { class: 4, isadd: false, changescore: 4, note: '垃圾未倒', submitter: '李晓鹏', reducetype: 'hygiene' },
  { class: 5, isadd: true, changescore: 6, note: '在学科竞赛中获奖', submitter: '李晓鹏' },
  { class: 5, isadd: false, changescore: 1, note: '忘记带作业', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 6, isadd: true, changescore: 3, note: '课间维持纪律', submitter: '李晓鹏' },
  { class: 7, isadd: false, changescore: 3, note: '在走廊大声喧哗', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 8, isadd: true, changescore: 4, note: '帮助老师搬运教具', submitter: '李晓鹏' },
  { class: 9, isadd: false, changescore: 2, note: '课堂传纸条', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 10, isadd: true, changescore: 5, note: '组织班级文艺活动', submitter: '李晓鹏' },
  { class: 15, isadd: true, changescore: 3, note: '主动帮助新同学', submitter: '李晓鹏' },
  { class: 16, isadd: false, changescore: 4, note: '课间打闹', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 17, isadd: true, changescore: 2, note: '拾金不昧', submitter: '李晓鹏' },
  { class: 18, isadd: false, changescore: 3, note: '不按时交作业', submitter: '李晓鹏', reducetype: 'discipline' },
  { class: 19, isadd: true, changescore: 4, note: '积极参与社团活动', submitter: '李晓鹏' },
  { class: 21, isadd: false, changescore: 2, note: '带零食进教室', submitter: '李晓鹏', reducetype: 'hygiene' },
  { class: 22, isadd: true, changescore: 3, note: '主动值日', submitter: '李晓鹏' },
  { class: 24, isadd: false, changescore: 5, note: '与同学发生冲突', submitter: '李晓鹏', reducetype: 'discipline' }
]

async function insertTestData() {
  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT)
  })

  try {
    console.log('🎯 开始插入测试数据...\n')

    for (const data of testData) {
      const today = new Date().toISOString().split('T')[0]
      
      await pool.query(`
        INSERT INTO reports 
        (class, isadd, changescore, note, submitter, reducetype, submittime, date_partition)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
      `, [
        data.class,
        data.isadd,
        data.changescore,
        data.note,
        data.submitter,
        data.reducetype || null,
        today
      ])
      
      console.log(`✅ 插入数据: ${data.class}班 - ${data.isadd ? '加分' : '扣分'} ${data.changescore}分 - ${data.note}${data.reducetype ? ` (${data.reducetype === 'discipline' ? '纪律违纪' : '卫生违纪'})` : ''}`)
    }

    console.log(`\n🎉 成功插入 ${testData.length} 条测试数据！`)
    
    // 显示统计信息
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN isadd THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN NOT isadd THEN 1 ELSE 0 END) as negative,
        COUNT(DISTINCT class) as active_classes
      FROM reports 
      WHERE date_partition = CURRENT_DATE
    `)
    
    const result = stats.rows[0]
    console.log('\n📊 今日统计:')
    console.log(`   总通报: ${result.total}`)
    console.log(`   表扬: ${result.positive}`)
    console.log(`   违纪: ${result.negative}`)
    console.log(`   活跃班级: ${result.active_classes}`)

  } catch (error) {
    console.error('❌ 插入测试数据失败:', error.message)
  } finally {
    await pool.end()
  }
}

// 确认提示
if (require.main === module) {
  console.log('📝 准备插入测试数据到数据库...')
  console.log('这将在今天的日期下添加一些示例通报数据。')
  console.log('如果不想继续，请在3秒内按 Ctrl+C 取消...\n')
  
  setTimeout(() => {
    insertTestData()
  }, 3000)
}