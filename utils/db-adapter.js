/**
 * 数据库适配器 - 提供统一的数据库操作接口
 * 支持PostgreSQL和SQLite
 */

const fs = require('fs')
const path = require('path')

// 为SQLite操作准备
const Database = require('better-sqlite3')
const dbDir = path.join(__dirname, '../DB')

// 获取数据库类型
function getDbType() {
  return global.dbContext.type
}

// 确保SQLite数据库表存在
function ensureSqliteTable(db) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class INTEGER NOT NULL,
      isadd BOOLEAN NOT NULL,
      changescore INTEGER NOT NULL,
      submittime INTEGER NOT NULL,
      note TEXT NOT NULL,
      submitter TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      month_partition TEXT NOT NULL,
      date_partition TEXT NOT NULL
    )
  `
  db.exec(createTableSQL)
  
  // 检查并添加 date_partition 列（如果不存在）
  try {
    const columnExists = db.prepare(`
      SELECT COUNT(*) as count FROM pragma_table_info('reports') 
      WHERE name='date_partition'
    `).get()
    
    if (columnExists.count === 0) {
      db.exec(`ALTER TABLE reports ADD COLUMN date_partition TEXT NOT NULL DEFAULT ''`)
      
      // 为现有数据填充 date_partition
      const updateStmt = db.prepare(`
        UPDATE reports 
        SET date_partition = date(datetime(submittime/1000, 'unixepoch')) 
        WHERE date_partition = ''
      `)
      updateStmt.run()
    }
  } catch (error) {
    console.log('列 date_partition 可能已存在:', error.message)
  }
  
  // 创建索引
  const indexes = [
    { name: 'idx_month_partition', sql: 'CREATE INDEX IF NOT EXISTS idx_month_partition ON reports(month_partition)' },
    { name: 'idx_date_class', sql: 'CREATE INDEX IF NOT EXISTS idx_date_class ON reports(date_partition, class)' },
    { name: 'idx_class_date', sql: 'CREATE INDEX IF NOT EXISTS idx_class_date ON reports(class, date_partition)' }
  ]
  
  indexes.forEach(index => {
    try {
      db.exec(index.sql)
    } catch (error) {
      console.log(`创建索引 ${index.name} 时出错:`, error.message)
    }
  })
}

// 获取或创建SQLite数据库文件
function getSqliteDatabase(monthPartition) {
  // 确保目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  
  const dbFileName = `reports_${monthPartition}.db`
  const dbPath = path.join(dbDir, dbFileName)
  const db = new Database(dbPath)
  
  // 确保表存在
  ensureSqliteTable(db)
  
  return db
}

// 根据时间生成月份分区标识
function getMonthPartition(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// 根据时间生成日期分区标识（YYYY-MM-DD格式）
function getDatePartition(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 确保PostgreSQL表存在
async function ensurePostgresTable(client) {
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
      // 创建表
      await client.query(`
        CREATE TABLE reports (
          id SERIAL PRIMARY KEY,
          class INTEGER NOT NULL,
          isadd BOOLEAN NOT NULL,
          changescore INTEGER NOT NULL,
          submittime BIGINT NOT NULL,
          note TEXT NOT NULL,
          submitter TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          month_partition TEXT NOT NULL,
          date_partition TEXT NOT NULL
        )
      `)
    } else {
      // 检查并添加 date_partition 列（如果不存在）
      const columnCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'reports' AND column_name = 'date_partition'
      `)
      
      if (columnCheck.rows.length === 0) {
        await client.query(`ALTER TABLE reports ADD COLUMN date_partition TEXT NOT NULL DEFAULT ''`)
        
        // 为现有数据填充 date_partition
        await client.query(`
          UPDATE reports 
          SET date_partition = to_char(to_timestamp(submittime/1000), 'YYYY-MM-DD') 
          WHERE date_partition = ''
        `)
      }
    }
    
    // 创建索引
    const indexes = [
      { name: 'reports_month_partition_idx', sql: 'CREATE INDEX IF NOT EXISTS reports_month_partition_idx ON reports(month_partition)' },
      { name: 'reports_date_class_idx', sql: 'CREATE INDEX IF NOT EXISTS reports_date_class_idx ON reports(date_partition, class)' },
      { name: 'reports_class_date_idx', sql: 'CREATE INDEX IF NOT EXISTS reports_class_date_idx ON reports(class, date_partition)' }
    ]
    
    for (const index of indexes) {
      try {
        await client.query(index.sql)
      } catch (error) {
        console.log(`创建索引 ${index.name} 时出错:`, error.message)
      }
    }
  } catch (error) {
    console.error('确保PostgreSQL表存在时出错:', error)
    throw error
  }
}

// 添加报告数据
async function addReport(data) {
  const { class: classNum, isadd, changescore, note, submitter } = data
  const submittime = Date.now()
  const monthPartition = getMonthPartition(submittime)
  const datePartition = getDatePartition(submittime)
  
  // 根据数据库类型执行不同操作
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      // 确保表存在
      await ensurePostgresTable(client)
      
      // 插入数据
      const query = `
        INSERT INTO reports 
        (class, isadd, changescore, submittime, note, submitter, month_partition, date_partition)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `
      
      const values = [
        parseInt(classNum),
        Boolean(isadd),
        parseInt(changescore),
        submittime,
        note,
        submitter,
        monthPartition,
        datePartition
      ]
      
      const result = await client.query(query, values)
      
      return {
        success: true,
        id: result.rows[0].id,
        database: monthPartition,
        submittime
      }
    } finally {
      client.release()
    }
  } else {
    // SQLite操作
    const db = getSqliteDatabase(monthPartition)
    
    try {
      // 插入数据
      const stmt = db.prepare(`
        INSERT INTO reports 
        (class, isadd, changescore, submittime, note, submitter, month_partition, date_partition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      const result = stmt.run(
        parseInt(classNum),
        Boolean(isadd) ? 1 : 0,  // SQLite需要0/1代替布尔值
        parseInt(changescore),
        submittime,
        note,
        submitter,
        monthPartition,
        datePartition
      )
      
      return {
        success: true,
        id: result.lastInsertRowid,
        database: monthPartition,
        submittime
      }
    } finally {
      db.close()
    }
  }
}

// 获取指定月份的报告
async function getReportsByMonth(yearMonth) {
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      await ensurePostgresTable(client)
      
      const query = `
        SELECT * FROM reports 
        WHERE month_partition = $1
        ORDER BY submittime DESC
      `
      
      const result = await client.query(query, [yearMonth])
      
      return result.rows
    } finally {
      client.release()
    }
  } else {
    // SQLite操作
    const db = getSqliteDatabase(yearMonth)
    
    try {
      // 检查表是否存在
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='reports'
      `).get()
      
      if (!tableExists) {
        return []
      }
      
      const rows = db.prepare(`
        SELECT * FROM reports 
        WHERE month_partition = ?
        ORDER BY submittime DESC
      `).all(yearMonth)
      
      return rows
    } finally {
      db.close()
    }
  }
}

// 获取指定日期的报告（所有班级）
async function getReportsByDate(date) {
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      await ensurePostgresTable(client)
      
      const query = `
        SELECT * FROM reports 
        WHERE date_partition = $1
        ORDER BY submittime DESC
      `
      
      const result = await client.query(query, [date])
      
      return result.rows
    } finally {
      client.release()
    }
  } else {
    // SQLite操作 - 需要查询所有可能的月份分区
    const [year, month] = date.split('-')
    const monthPartition = `${year}-${month}`
    const db = getSqliteDatabase(monthPartition)
    
    try {
      // 检查表是否存在
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='reports'
      `).get()
      
      if (!tableExists) {
        return []
      }
      
      const rows = db.prepare(`
        SELECT * FROM reports 
        WHERE date_partition = ?
        ORDER BY submittime DESC
      `).all(date)
      
      return rows
    } finally {
      db.close()
    }
  }
}

// 获取指定日期和班级的报告
async function getReportsByDateAndClass(date, classNum) {
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      await ensurePostgresTable(client)
      
      const query = `
        SELECT * FROM reports 
        WHERE date_partition = $1 AND class = $2
        ORDER BY submittime DESC
      `
      
      const result = await client.query(query, [date, parseInt(classNum)])
      
      return result.rows
    } finally {
      client.release()
    }
  } else {
    // SQLite操作
    const [year, month] = date.split('-')
    const monthPartition = `${year}-${month}`
    const db = getSqliteDatabase(monthPartition)
    
    try {
      // 检查表是否存在
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='reports'
      `).get()
      
      if (!tableExists) {
        return []
      }
      
      const rows = db.prepare(`
        SELECT * FROM reports 
        WHERE date_partition = ? AND class = ?
        ORDER BY submittime DESC
      `).all(date, parseInt(classNum))
      
      return rows
    } finally {
      db.close()
    }
  }
}

// 获取指定班级在某个日期范围内的报告
async function getReportsByClassAndDateRange(classNum, startDate, endDate) {
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      await ensurePostgresTable(client)
      
      const query = `
        SELECT * FROM reports 
        WHERE class = $1 AND date_partition BETWEEN $2 AND $3
        ORDER BY submittime DESC
      `
      
      const result = await client.query(query, [parseInt(classNum), startDate, endDate])
      
      return result.rows
    } finally {
      client.release()
    }
  } else {
    // SQLite操作 - 需要查询多个月份分区
    const results = []
    const startYear = parseInt(startDate.split('-')[0])
    const startMonth = parseInt(startDate.split('-')[1])
    const endYear = parseInt(endDate.split('-')[0])
    const endMonth = parseInt(endDate.split('-')[1])
    
    // 遍历所需的月份分区
    for (let year = startYear; year <= endYear; year++) {
      const monthStart = (year === startYear) ? startMonth : 1
      const monthEnd = (year === endYear) ? endMonth : 12
      
      for (let month = monthStart; month <= monthEnd; month++) {
        const monthPartition = `${year}-${String(month).padStart(2, '0')}`
        const db = getSqliteDatabase(monthPartition)
        
        try {
          // 检查表是否存在
          const tableExists = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='reports'
          `).get()
          
          if (tableExists) {
            const rows = db.prepare(`
              SELECT * FROM reports 
              WHERE class = ? AND date_partition BETWEEN ? AND ?
              ORDER BY submittime DESC
            `).all(parseInt(classNum), startDate, endDate)
            
            results.push(...rows)
          }
        } finally {
          db.close()
        }
      }
    }
    
    // 按时间排序
    return results.sort((a, b) => b.submittime - a.submittime)
  }
}

module.exports = {
  addReport,
  getReportsByMonth,
  getMonthPartition,
  getReportsByDate,
  getReportsByDateAndClass,
  getReportsByClassAndDateRange
}
