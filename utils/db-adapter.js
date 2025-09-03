/**
 * 数据库适配器 - PostgreSQL专用版本（优化版）
 * 提供基于日期和班级的复合索引优化查询
 * 优化点：
 * 1. 使用原生TIMESTAMP类型替代BIGINT时间戳
 * 2. 减少冗余索引
 * 3. 初始化逻辑只在启动时执行一次
 * 4. 优化字段类型
 */

// 标记是否已初始化
let isInitialized = false

// 初始化数据库表和索引（只在启动时执行一次）
async function initializeDatabase() {
  if (isInitialized) {
    return
  }

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
      // 创建新表，使用优化的字段类型和生成列
      await client.query(`
        CREATE TABLE reports (
          id SERIAL PRIMARY KEY,
          class INTEGER NOT NULL,
          isadd BOOLEAN NOT NULL,
          changescore INTEGER NOT NULL,
          submittime TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          note TEXT NOT NULL,
          submitter TEXT NOT NULL,
          -- 生成列：自动从 submittime 计算日期，支持高效索引
          date_partition DATE GENERATED ALWAYS AS (DATE(submittime)) STORED
        )
      `)
      console.log('✅ 创建 reports 表成功')
    } else {
        // 检查是否需要迁移旧的BIGINT时间戳
        const columnCheck = await client.query(`
          SELECT column_name, data_type FROM information_schema.columns 
          WHERE table_name = 'reports' AND column_name = 'submittime'
        `)
        
        if (columnCheck.rows.length > 0 && columnCheck.rows[0].data_type === 'bigint') {
          console.log('🔄 检测到旧的BIGINT时间戳格式，开始迁移...')
          
          // 添加新的TIMESTAMP列
          await client.query(`ALTER TABLE reports ADD COLUMN submittime_new TIMESTAMP WITH TIME ZONE`)
          
          // 转换数据
          await client.query(`
            UPDATE reports 
            SET submittime_new = to_timestamp(submittime/1000.0)
            WHERE submittime_new IS NULL
          `)
          
          // 删除旧列，重命名新列
          await client.query(`ALTER TABLE reports DROP COLUMN submittime`)
          await client.query(`ALTER TABLE reports RENAME COLUMN submittime_new TO submittime`)
          
          // 设置默认值
          await client.query(`ALTER TABLE reports ALTER COLUMN submittime SET DEFAULT CURRENT_TIMESTAMP`)
          
          console.log('✅ 时间戳格式迁移完成')
        }
        
        // 检查并添加 date_partition 生成列（如果不存在）
        const datePartitionCheck = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'reports' AND column_name = 'date_partition'
        `)
        
        if (datePartitionCheck.rows.length === 0) {
          console.log('🔄 添加 date_partition 字段...')
          
          // 添加普通的 DATE 类型字段
          await client.query(`
            ALTER TABLE reports 
            ADD COLUMN date_partition DATE
          `)
          
          // 为现有数据填充 date_partition（处理旧的BIGINT时间戳）
          const hasOldTimestamp = await client.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'reports' AND column_name = 'submittime'
          `)
          
          if (hasOldTimestamp.rows[0]?.data_type === 'bigint') {
            // 如果是旧的BIGINT格式
            await client.query(`
              UPDATE reports 
              SET date_partition = DATE(to_timestamp(submittime/1000.0))
              WHERE date_partition IS NULL
            `)
          } else {
            // 如果是新的TIMESTAMP格式
            await client.query(`
              UPDATE reports 
              SET date_partition = DATE(submittime)
              WHERE date_partition IS NULL
            `)
          }
          
          // 设置 NOT NULL 约束
          await client.query(`
            ALTER TABLE reports 
            ALTER COLUMN date_partition SET NOT NULL
          `)
          
          console.log('✅ date_partition 字段添加完成')
        }
        
        // 删除旧的分区字段（如果存在）
        const oldPartitionColumns = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'reports' AND column_name IN ('month_partition')
        `)
        
        for (const row of oldPartitionColumns.rows) {
          await client.query(`ALTER TABLE reports DROP COLUMN IF EXISTS ${row.column_name}`)
          console.log(`🗑️ 删除冗余字段: ${row.column_name}`)
        }
      }
    
    // 创建优化的索引（使用生成列，避免IMMUTABLE问题）
    const indexes = [
      { 
        name: 'reports_date_class_idx', 
        sql: 'CREATE INDEX IF NOT EXISTS reports_date_class_idx ON reports(date_partition, class)',
        description: '日期+班级复合索引（普通字段）'
      },
      {
        name: 'reports_submittime_idx',
        sql: 'CREATE INDEX IF NOT EXISTS reports_submittime_idx ON reports(submittime)',
        description: '时间戳索引'
      },
      {
        name: 'reports_class_idx',
        sql: 'CREATE INDEX IF NOT EXISTS reports_class_idx ON reports(class)',
        description: '班级索引'
      },
      {
        name: 'reports_date_partition_idx',
        sql: 'CREATE INDEX IF NOT EXISTS reports_date_partition_idx ON reports(date_partition)',
        description: '日期分区索引'
      }
    ]
    
    for (const index of indexes) {
      try {
        await client.query(index.sql)
        console.log(`✅ 创建索引: ${index.name} - ${index.description}`)
      } catch (error) {
        console.log(`❌ 创建索引 ${index.name} 失败:`, error.message)
      }
    }
    
    isInitialized = true
    console.log('🎉 数据库初始化完成')
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    throw error
  } finally {
    client.release()
  }
}

// 添加报告数据
async function addReport(data) {
  const { class: classNum, isadd, changescore, note, submitter } = data
  
  const client = await global.dbContext.instance.connect()
  
  try {
    // 在应用端计算日期分区，避免数据库IMMUTABLE限制
    const now = new Date()
    const datePartition = now.toISOString().split('T')[0] // YYYY-MM-DD格式
    
    // 插入数据，包含日期分区字段
    const query = `
      INSERT INTO reports 
      (class, isadd, changescore, note, submitter, submittime, date_partition)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
      RETURNING id, submittime
    `
    
    const values = [
      parseInt(classNum),
      Boolean(isadd),
      parseInt(changescore),
      note,
      submitter,
      datePartition
    ]
    
    const result = await client.query(query, values)
    
    return {
      success: true,
      id: result.rows[0].id,
      submittime: result.rows[0].submittime,
      date_partition: datePartition
    }
  } finally {
    client.release()
  }
}

// 获取指定月份的报告
async function getReportsByMonth(yearMonth) {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 使用PostgreSQL的date_trunc函数直接从submittime计算月份
    const query = `
      SELECT * FROM reports 
      WHERE date_trunc('month', submittime) = $1::date
      ORDER BY submittime DESC
    `
    
    const result = await client.query(query, [`${yearMonth}-01`])
    
    return result.rows
  } finally {
    client.release()
  }
}

// 获取指定日期的报告（所有班级）
async function getReportsByDate(date) {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 使用生成的 date_partition 列，享受索引优化
    const query = `
      SELECT * FROM reports 
      WHERE date_partition = $1::date
      ORDER BY submittime DESC
    `
    
    const result = await client.query(query, [date])
    
    return result.rows
  } finally {
    client.release()
  }
}

// 获取指定日期和班级的报告（利用复合索引）
async function getReportsByDateAndClass(date, classNum) {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 这个查询会使用我们的复合索引 reports_date_class_idx(date_partition, class)
    const query = `
      SELECT * FROM reports 
      WHERE date_partition = $1::date AND class = $2
      ORDER BY submittime DESC
    `
    
    const result = await client.query(query, [date, parseInt(classNum)])
    
    return result.rows
  } finally {
    client.release()
  }
}

// 获取指定班级在某个日期范围内的报告
async function getReportsByClassAndDateRange(classNum, startDate, endDate) {
  const client = await global.dbContext.instance.connect()
  
  try {
    const query = `
      SELECT * FROM reports 
      WHERE class = $1 AND date_partition BETWEEN $2::date AND $3::date
      ORDER BY submittime DESC
    `
    
    const result = await client.query(query, [parseInt(classNum), startDate, endDate])
    
    return result.rows
  } finally {
    client.release()
  }
}

// 获取指定用户在某个日期范围内的报告
async function getReportsByUserAndDateRange(userId, startDate, endDate) {
  const client = await global.dbContext.instance.connect()
  
  try {
    // 修复查询语法
    const result = await client.query(`
      SELECT * FROM reports 
      WHERE user_id = $1 AND submit_date BETWEEN $2 AND $3
      ORDER BY submit_date DESC
    `, [userId, startDate, endDate]);

    return result.rows;
  } finally {
    client.release()
  }
}

// 获取指定日期范围内的报告
async function getReportsByDateRange(startDate, endDate) {
    try {
        const result = await pool.query(`
            SELECT * FROM reports 
            WHERE submit_date BETWEEN $1 AND $2
            ORDER BY submit_date DESC
        `, [startDate, endDate]);
        return result.rows;
    } catch (error) {
        throw error;
    }
}

// 更新报告状态
async function updateReportStatus(reportId, status) {
    try {
        const result = await pool.query(`
            UPDATE reports 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [status, reportId]);
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

// 删除报告
async function deleteReport(reportId) {
    try {
        const result = await pool.query(`
            DELETE FROM reports 
            WHERE id = $1
            RETURNING *
        `, [reportId]);
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

// 获取所有报告（带用户信息）
async function getAllReportsWithUser() {
    const client = await global.dbContext.instance.connect()
    
    try {
      // 修复未终止的模板字面量
      const query = `
        SELECT r.*, u.username 
        FROM reports r 
        JOIN users u ON r.user_id = u.id 
        WHERE r.status = $1
        ORDER BY r.submit_date DESC
      `;
      
      const result = await client.query(query, ['active'])
      
      return result.rows
    } finally {
      client.release()
    }
}

module.exports = {
  initializeDatabase,
  addReport,
  getReportsByMonth,
  getReportsByDate,
  getReportsByDateAndClass,
  getReportsByClassAndDateRange,
  getReportsByUserAndDateRange,
  getReportsByDateRange,
  updateReportStatus,
  deleteReport,
  getAllReportsWithUser
}
