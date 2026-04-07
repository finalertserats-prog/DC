import axios from 'axios'

const api = axios.create({ baseURL: 'http://135.181.157.21:3000/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('sdp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 403) {
      localStorage.removeItem('sdp_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
