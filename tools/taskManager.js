/**
 * 任务管理工具模块
 * 支持任务分解、排期、进度跟踪
 * 数据存储在 ./temps/todo_<model_name>.json
 */

const fs = require('fs').promises;
const path = require('path');

class TaskManagerTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.tempsDir = path.join(__dirname, '..', 'temps');
  }

  async handle(args) {
    const { 
      operation, 
      model_name = 'default',
      task_id,
      title,
      description,
      priority = 'medium',
      due_date,
      subtasks = [],
      status = 'pending',
      progress = 0
    } = args;

    try {
      switch (operation) {
        case 'create':
          return await this.createTask(model_name, { title, description, priority, due_date, subtasks });
        case 'update':
          return await this.updateTask(model_name, task_id, { title, description, priority, due_date, subtasks, status, progress });
        case 'delete':
          return await this.deleteTask(model_name, task_id);
        case 'list':
          return await this.listTasks(model_name, status);
        case 'complete':
          return await this.completeTask(model_name, task_id);
        case 'get':
          return await this.getTask(model_name, task_id);
        case 'clear':
          return await this.clearAllTasks(model_name);
        default:
          throw new Error(`不支持的操作类型: ${operation}`);
      }
    } catch (error) {
      throw new Error(`任务管理操作失败: ${error.message}`);
    }
  }

  async createTask(modelName, taskData) {
    const tasks = await this.loadTasks(modelName);
    const taskId = this.generateTaskId();
    const now = new Date().toISOString();
    
    const newTask = {
      id: taskId,
      title: taskData.title,
      description: taskData.description || '',
      priority: taskData.priority,
      due_date: taskData.due_date || null,
      subtasks: taskData.subtasks || [],
      status: 'pending',
      progress: 0,
      created_at: now,
      updated_at: now
    };

    tasks.push(newTask);
    await this.saveTasks(modelName, tasks);

    return {
      content: [
        {
          type: 'text',
          text: `任务创建成功!\n任务ID: ${taskId}\n标题: ${newTask.title}\n优先级: ${newTask.priority}\n状态: ${newTask.status}`
        }
      ]
    };
  }

  async updateTask(modelName, taskId, updateData) {
    const tasks = await this.loadTasks(modelName);
    const taskIndex = tasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const task = tasks[taskIndex];
    const now = new Date().toISOString();

    // 更新任务数据
    if (updateData.title !== undefined) task.title = updateData.title;
    if (updateData.description !== undefined) task.description = updateData.description;
    if (updateData.priority !== undefined) task.priority = updateData.priority;
    if (updateData.due_date !== undefined) task.due_date = updateData.due_date;
    if (updateData.subtasks !== undefined) task.subtasks = updateData.subtasks;
    if (updateData.status !== undefined) task.status = updateData.status;
    if (updateData.progress !== undefined) task.progress = updateData.progress;
    
    task.updated_at = now;

    await this.saveTasks(modelName, tasks);

    return {
      content: [
        {
          type: 'text',
          text: `任务更新成功!\n任务ID: ${taskId}\n标题: ${task.title}\n状态: ${task.status}\n进度: ${task.progress}%`
        }
      ]
    };
  }

  async deleteTask(modelName, taskId) {
    const tasks = await this.loadTasks(modelName);
    const taskIndex = tasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const deletedTask = tasks.splice(taskIndex, 1)[0];
    await this.saveTasks(modelName, tasks);

    return {
      content: [
        {
          type: 'text',
          text: `任务删除成功!\n已删除任务: ${deletedTask.title} (ID: ${taskId})`
        }
      ]
    };
  }

  async listTasks(modelName, statusFilter = null) {
    const tasks = await this.loadTasks(modelName);
    let filteredTasks = tasks;

    if (statusFilter) {
      filteredTasks = tasks.filter(task => task.status === statusFilter);
    }

    if (filteredTasks.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `没有找到任务${statusFilter ? ` (状态: ${statusFilter})` : ''}`
          }
        ]
      };
    }

    const taskList = filteredTasks.map(task => {
      const dueDate = task.due_date ? `截止: ${task.due_date}` : '无截止日期';
      const subtasksInfo = task.subtasks.length > 0 ? `子任务: ${task.subtasks.length}个` : '无子任务';
      
      return `[${task.id}] ${task.title}
  状态: ${task.status} | 优先级: ${task.priority} | 进度: ${task.progress}%
  ${dueDate} | ${subtasksInfo}
  描述: ${task.description}
  创建时间: ${task.created_at}
  ${'='.repeat(50)}`;
    }).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `任务列表 (${filteredTasks.length}个任务):\n\n${taskList}`
        }
      ]
    };
  }

  async completeTask(modelName, taskId) {
    return await this.updateTask(modelName, taskId, { 
      status: 'completed', 
      progress: 100 
    });
  }

  async getTask(modelName, taskId) {
    const tasks = await this.loadTasks(modelName);
    const task = tasks.find(task => task.id === taskId);
    
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const subtasksList = task.subtasks.length > 0 
      ? task.subtasks.map((subtask, index) => `${index + 1}. ${subtask}`).join('\n')
      : '无子任务';

    return {
      content: [
        {
          type: 'text',
          text: `任务详情:
ID: ${task.id}
标题: ${task.title}
描述: ${task.description}
状态: ${task.status}
优先级: ${task.priority}
进度: ${task.progress}%
截止日期: ${task.due_date || '无'}
创建时间: ${task.created_at}
更新时间: ${task.updated_at}

子任务:
${subtasksList}`
        }
      ]
    };
  }

  async clearAllTasks(modelName) {
    await this.saveTasks(modelName, []);
    
    return {
      content: [
        {
          type: 'text',
          text: `已清空所有任务 (模型: ${modelName})`
        }
      ]
    };
  }

  async loadTasks(modelName) {
    try {
      const filePath = this.getTaskFilePath(modelName);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // 文件不存在，返回空数组
      }
      throw error;
    }
  }

  async saveTasks(modelName, tasks) {
    const filePath = this.getTaskFilePath(modelName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf8');
  }

  getTaskFilePath(modelName) {
    // 清理模型名称，移除特殊字符
    const cleanModelName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.tempsDir, `todo_${cleanModelName}.json`);
  }

  generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = TaskManagerTool;
