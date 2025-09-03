/**
 * 数据库迁移脚本 - 为现有数据添加日期分区字段
 * 将Unix时间戳转换为YYYY-MM-DD格式的日期字符串
 */

const dbAdapter = require('./db-adapter')

async function migrateDatabase() {
  console.log('开始数据库迁移...')
  
  try {
    const dbType = global.dbContext.type
    
    if (dbType === 'postgres') {
      console.log('迁移PostgreSQL数据库...')
      await migratePostgres()
    } else {
      console.log('迁移SQLite数据库...')
      await migrateSqlite()
    }
    
    console.log('数据库迁移完成！')
  } catch (error) {
    console.error('数据库迁移失败:', error)
    throw error
  }
}

async function migratePostgres() {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 检查 date_partition 列是否存在
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'reports' AND column_name = 'date_partition'
    `)
    
    if (columnCheck.rows.length === 0) {
      console.log('添加 date_partition 列...')
      await client.query(`ALTER TABLE reports ADD COLUMN date_partition TEXT`)
    }
    
    // 更新现有数据的 date_partition 字段
    console.log('更新现有数据的日期分区...')
    const updateResult = await client.query(`
      UPDATE reports 
      SET date_partition = to_char(to_timestamp(submittime/1000), 'YYYY-MM-DD') 
      WHERE date_partition IS NULL OR date_partition = ''
    `)
    
    console.log(`已更新 ${updateResult.rowCount} 条记录`)
    
    // 创建索引
    console.log('创建复合索引...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS reports_date_class_idx ON reports(date_partition, class)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS reports_class_date_idx ON reports(class, date_partition)
    `)
    
  } finally {
    client.release()
  }
}

async function migrateSqlite() {
  const fs = require('fs')
  const path = require('path')
  const Database = require('better-sqlite3')
  
  const dbDir = path.join(__dirname, '../DB')
  
  if (!fs.existsSync(dbDir)) {
    console.log('SQLite数据库目录不存在，无需迁移')
    return
  }
  
  const dbFiles = fs.readdirSync(dbDir).filter(file => file.endsWith('.db'))
  
  for (const dbFile of dbFiles) {
    console.log(`迁移数据库文件: ${dbFile}`)
    const dbPath = path.join(dbDir, dbFile)
    const db = new Database(dbPath)
    
    try {
      // 检查 date_partition 列是否存在
      const columnExists = db.prepare(`
        SELECT COUNT(*) as count FROM pragma_table_info('reports') 
        WHERE name='date_partition'
      `).get()
      
      if (columnExists.count === 0) {
        console.log(`  添加 date_partition 列到 ${dbFile}...`)
        db.exec(`ALTER TABLE reports ADD COLUMN date_partition TEXT`)
      }
      
      // 更新现有数据的 date_partition 字段
      console.log(`  更新 ${dbFile} 中的日期分区...`)
      const updateStmt = db.prepare(`
        UPDATE reports 
        SET date_partition = date(datetime(submittime/1000, 'unixepoch')) 
        WHERE date_partition IS NULL OR date_partition = ''
      `)
      const updateResult = updateStmt.run()
      
      console.log(`  已更新 ${updateResult.changes} 条记录`)
      
      // 创建索引
      console.log(`  为 ${dbFile} 创建复合索引...`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_date_class ON reports(date_partition, class)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_class_date ON reports(class, date_partition)`)
      
    } finally {
      db.close()
    }
  }
}

module.exports = {
  migrateDatabase
}