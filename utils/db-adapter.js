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
      month_partition TEXT NOT NULL
    )
  `
  db.exec(createTableSQL)
  
  // 检查索引是否存在
  const indexExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name='idx_month_partition'
  `).get()
  
  if (!indexExists) {
    db.exec(`CREATE INDEX idx_month_partition ON reports(month_partition)`)
  }
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
          month_partition TEXT NOT NULL
        )
      `)
      
      // 创建索引
      await client.query(`
        CREATE INDEX reports_month_partition_idx ON reports(month_partition)
      `)
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
  
  // 根据数据库类型执行不同操作
  if (getDbType() === 'postgres') {
    const client = await global.dbContext.instance.connect()
    
    try {
      // 确保表存在
      await ensurePostgresTable(client)
      
      // 插入数据
      const query = `
        INSERT INTO reports 
        (class, isadd, changescore, submittime, note, submitter, month_partition)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `
      
      const values = [
        parseInt(classNum),
        Boolean(isadd),
        parseInt(changescore),
        submittime,
        note,
        submitter,
        monthPartition
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
        (class, isadd, changescore, submittime, note, submitter, month_partition)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      const result = stmt.run(
        parseInt(classNum),
        Boolean(isadd) ? 1 : 0,  // SQLite需要0/1代替布尔值
        parseInt(changescore),
        submittime,
        note,
        submitter,
        monthPartition
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

module.exports = {
  addReport,
  getReportsByMonth,
  getMonthPartition
}
