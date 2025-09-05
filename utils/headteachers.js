/**
 * 班主任数据管理模块
 * 提供班级和班主任的映射关系
 */

const fs = require('fs')
const path = require('path')

// 班主任数据缓存
let headteachersData = null

// 加载班主任数据
function loadHeadteachers() {
  if (headteachersData) {
    return headteachersData
  }

  try {
    // 从环境变量获取数据文件路径
    const dataDir = process.env.DATA_DIR || '../JSON'
    const filePath = path.join(__dirname, dataDir, 'class.json')
    
    const data = fs.readFileSync(filePath, 'utf8')
    headteachersData = JSON.parse(data)
    console.log('✅ 班主任数据加载成功')
    return headteachersData
  } catch (error) {
    console.error('❌ 加载班主任数据失败:', error)
    return []
  }
}

// 根据班级号获取班主任姓名
function getHeadteacher(classNum) {
  const data = loadHeadteachers()
  const classItem = data.find(item => item.class === parseInt(classNum))
  const defaultTeacher = process.env.DEFAULT_HEADTEACHER_FORMAT || '{classNum}班班主任'
  return classItem ? classItem.headteacher : defaultTeacher.replace('{classNum}', classNum)
}

// 获取所有班级列表
function getAllClasses() {
  return loadHeadteachers()
}

// 重新加载数据（用于热更新）
function reloadHeadteachers() {
  headteachersData = null
  return loadHeadteachers()
}

module.exports = {
  loadHeadteachers,
  getHeadteacher,
  getAllClasses,
  reloadHeadteachers
}