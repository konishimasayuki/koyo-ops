async function request(path, { method = 'GET', data } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(json.error || `通信エラー（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  me: () => request('/api/auth'),
  login: (username, password) => request('/api/auth', { method: 'POST', data: { username, password } }),
  logout: () => request('/api/auth', { method: 'DELETE' }),
  users: () => request('/api/users'),
  addUser: (u) => request('/api/users', { method: 'POST', data: u }),
  updateUser: (u) => request('/api/users', { method: 'PUT', data: u }),
  deleteUser: (id) => request(`/api/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  tasks: () => request('/api/tasks'),
  addTask: (t) => request('/api/tasks', { method: 'POST', data: t }),
  updateTask: (t) => request('/api/tasks', { method: 'PUT', data: t }),
  deleteTask: (id) => request(`/api/tasks?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importTasks: () => request('/api/tasks?action=import', { method: 'POST' }),
  taskConfig: () => request('/api/config'),
  docs: () => request('/api/docs'),
  docChunk: (id, i) => request(`/api/docs?id=${encodeURIComponent(id)}&chunk=${i}`),
  addDoc: (d) => request('/api/docs', { method: 'POST', data: d }),
  putDocChunk: (id, i, data) => request(`/api/docs?id=${encodeURIComponent(id)}&chunk=${i}`, { method: 'PUT', data: { data } }),
  finishDoc: (id) => request(`/api/docs?action=finish&id=${encodeURIComponent(id)}`, { method: 'POST' }),
  updateDoc: (d) => request('/api/docs', { method: 'PUT', data: d }),
  deleteDoc: (id) => request(`/api/docs?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveTaskConfig: (c) => request('/api/config', { method: 'PUT', data: c }),
  vehicles: () => request('/api/vehicles'),
  addVehicle: (v) => request('/api/vehicles', { method: 'POST', data: v }),
  updateVehicle: (v) => request('/api/vehicles', { method: 'PUT', data: v }),
  deleteVehicle: (id) => request(`/api/vehicles?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
