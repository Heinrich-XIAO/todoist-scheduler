export function getPrimaryQueueTask(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  return tasks[0] || null;
}

export function getPrimaryQueueTaskId(tasks) {
  const task = getPrimaryQueueTask(tasks);
  return task?.id || null;
}
