import { prisma } from '../lib/prisma'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import dayjs from 'dayjs'

interface FilterProps {
  filter: string
}

export async function appRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const habits = await prisma.habit.findMany({})
    return habits
  })

  app.get('/day', async (request) => {
    const getDayParams = z.object({
      date: z.coerce.date(),
    })

    const { date } = getDayParams.parse(request.query)
    const parsedDate = dayjs(date).startOf('day')
    const weekDay = parsedDate.get('day')

    console.log(date, weekDay)

    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        weekDays: {
          some: {
            week_day: weekDay,
          },
        },
      },
    })

    const day = await prisma.day.findUnique({
      where: {
        date: parsedDate.toDate(),
      },
      include: {
        dayHabits: true,
      },
    })

    const completedHabits =
      day?.dayHabits.map((dayHabit) => {
        return dayHabit.habit_id
      }) ?? []
    return { possibleHabits, completedHabits }
  })

  app.get('/filter', async (filter) => {
    const filterHabits = await prisma.habit.findMany({
      where: {
        title: {
          startsWith: `${filter}`,
        },
      },
    })
    return filterHabits
  })

  app.post('/habits', async (request) => {
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(z.number().min(0).max(6)),
    })

    const { title, weekDays } = createHabitBody.parse(request.body)
    const today = dayjs().startOf('day').toDate()

    await prisma.habit.create({
      data: {
        title,
        created_at: today,
        weekDays: {
          create: weekDays.map((weekDays) => {
            return {
              week_day: weekDays,
            }
          }),
        },
      },
    })
  })

  app.patch('/habits/:id/toggle', async (request) => {
    const toggleHabitsParams = z.object({ id: z.string().uuid() })
    const { id } = toggleHabitsParams.parse(request.params)
    const today = dayjs().startOf('day').toDate()

    let day = await prisma.day.findUnique({
      where: {
        date: today,
      },
    })
    if (!day) {
      day = await prisma.day.create({
        data: {
          date: today,
        },
      })
    }

    const dayHabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id: {
          day_id: day.id,
          habit_id: id,
        },
      },
    })

    if (dayHabit) {
      // remover a marcação de completo
      await prisma.dayHabit.delete({
        where: {
          id: dayHabit.id,
        },
      })
    } else {
      // completar o habito
      await prisma.dayHabit.create({
        data: {
          day_id: day.id,
          habit_id: id,
        },
      })
    }
  })

  app.get('/summary', async () => {
    const summary = await prisma.$queryRaw`
      SELECT 
        D.id, 
        D.date,
        (
          SELECT
            cast(count(*) as float)
          FROM days_habits DH
          WHERE DH.day_id = D.id

        ) as completed,
        (
          SELECT
          cast(count(*) as float)
          FROM habits_weeks_days HWD
          JOIN habits H
            ON H.id = HWD.habit_id
          WHERE 
            HWD.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch' ) as int)
            AND H.created_at <= D.date
        ) as amount
        
      FROM days D
    `
    return summary
  })
}
