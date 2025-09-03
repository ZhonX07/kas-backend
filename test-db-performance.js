/**
 * 数据库性能测试脚本
 * 验证索引效果和查询性能
 */

require('dotenv').config()
const { Pool } = require('pg')

async function performanceTest() {
  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT)
  })

  try {
    console.log('🧪 开始数据库性能测试...\n')

    // 1. 检查表结构
    console.log('📋 检查表结构:')
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'reports' 
      ORDER BY ordinal_position
    `)
    
    tableStructure.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`)
    })
    console.log()

    // 2. 检查索引
    console.log('🔍 检查索引:')
    const indexes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'reports'
      ORDER BY indexname
    `)
    
    indexes.rows.forEach(row => {
      console.log(`  - ${row.indexname}`)
      console.log(`    ${row.indexdef}`)
    })
    console.log()

    // 3. 检查数据量
    const countResult = await pool.query('SELECT COUNT(*) as total FROM reports')
    console.log(`📊 当前数据量: ${countResult.rows[0].total} 条记录\n`)

    // 4. 测试查询性能
    console.log('⚡ 查询性能测试:')
    
    // 测试日期查询
    const start1 = Date.now()
    await pool.query(`
      SELECT COUNT(*) FROM reports 
      WHERE date_partition = CURRENT_DATE
    `)
    const time1 = Date.now() - start1
    console.log(`  - 按日期查询: ${time1}ms`)

    // 测试复合查询
    const start2 = Date.now()
    await pool.query(`
      SELECT COUNT(*) FROM reports 
      WHERE date_partition = CURRENT_DATE AND class = 1
    `)
    const time2 = Date.now() - start2
    console.log(`  - 按日期+班级查询: ${time2}ms`)

    // 测试范围查询
    const start3 = Date.now()
    await pool.query(`
      SELECT COUNT(*) FROM reports 
      WHERE date_partition BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE
    `)
    const time3 = Date.now() - start3
    console.log(`  - 按日期范围查询: ${time3}ms`)

    // 5. 查询计划分析
    console.log('\n📈 查询计划分析:')
    const explain = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS) 
      SELECT * FROM reports 
      WHERE date_partition = CURRENT_DATE AND class = 1
      ORDER BY submittime DESC
    `)
    
    explain.rows.forEach(row => {
      console.log(`  ${row['QUERY PLAN']}`)
    })

    console.log('\n✅ 性能测试完成!')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
  } finally {
    await pool.end()
  }
}

// 运行测试
if (require.main === module) {
  performanceTest()
}