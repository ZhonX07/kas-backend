/**
 * 数据库重置脚本
 * 清理表结构，重新开始
 */

require('dotenv').config()
const { Pool } = require('pg')

async function resetDatabase() {
  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT)
  })

  try {
    console.log('🗑️  开始重置数据库...\n')

    // 1. 删除现有的表（如果存在）
    console.log('删除现有表和相关对象...')
    
    // 删除触发器
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_update_date_partition ON reports;
    `).catch(() => {}) // 忽略错误
    
    // 删除函数
    await pool.query(`
      DROP FUNCTION IF EXISTS update_date_partition();
    `).catch(() => {}) // 忽略错误
    
    // 删除表
    await pool.query(`
      DROP TABLE IF EXISTS reports CASCADE;
    `)
    
    console.log('✅ 清理完成\n')

    // 2. 重新创建表
    console.log('重新创建 reports 表...')
    await pool.query(`
      CREATE TABLE reports (
        id SERIAL PRIMARY KEY,
        class INTEGER NOT NULL,
        isadd BOOLEAN NOT NULL,
        changescore INTEGER NOT NULL,
        submittime TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        note TEXT NOT NULL,
        submitter TEXT NOT NULL,
        reducetype VARCHAR(20) CHECK (reducetype IN ('discipline', 'hygiene')) DEFAULT NULL,
        date_partition DATE NOT NULL
      )
    `)
    
    console.log('✅ 表创建完成')

    // 3. 创建索引
    console.log('创建索引...')
    
    const indexes = [
      'CREATE INDEX reports_date_class_idx ON reports(date_partition, class)',
      'CREATE INDEX reports_submittime_idx ON reports(submittime)',
      'CREATE INDEX reports_class_idx ON reports(class)',
      'CREATE INDEX reports_date_partition_idx ON reports(date_partition)'
    ]
    
    for (const indexSql of indexes) {
      await pool.query(indexSql)
      console.log(`✅ ${indexSql}`)
    }

    console.log('\n🎉 数据库重置完成!')
    console.log('现在可以重新启动服务器了。')

  } catch (error) {
    console.error('❌ 重置失败:', error.message)
  } finally {
    await pool.end()
  }
}

// 确认提示
if (require.main === module) {
  console.log('⚠️  警告: 此操作将删除所有现有数据!')
  console.log('如果确定要继续，请在5秒内按 Ctrl+C 取消...\n')

  setTimeout(() => {
    resetDatabase()
  }, 5000)
}