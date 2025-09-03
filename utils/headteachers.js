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
    const filePath = path.join(__dirname, '../JSON/class.json')
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
  return classItem ? classItem.headteacher : `${classNum}班班主任`
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