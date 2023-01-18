import Fastify from 'fastify'
import cors from '@fastify/cors'
import { appRoutes } from './lib/routes'

const app = Fastify()

app.register(cors)
// app.register(cors, {
//   origin: 'https://localhost:3333',
// })
app.register(appRoutes)

app
  .listen({
    port: 3333,
  })
  .then(() => {
    console.log('listening on port 3333')
  })
