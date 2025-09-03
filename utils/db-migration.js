/**
 * 数据库迁移脚本 - PostgreSQL专用版本
 * 为现有数据添加日期分区字段，将Unix时间戳转换为YYYY-MM-DD格式
 */

async function migrateDatabase() {
  console.log('开始PostgreSQL数据库迁移...')
  
  try {
    await migratePostgres()
    console.log('数据库迁移完成！')
  } catch (error) {
    console.error('数据库迁移失败:', error)
    throw error
  }
}

async function migratePostgres() {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 检查表是否存在
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reports'
      )
    `)
    
    if (!tableCheck.rows[0].exists) {
      console.log('表 reports 不存在，无需迁移')
      return
    }
    
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
    
    // 创建复合索引
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

module.exports = {
  migrateDatabase
}