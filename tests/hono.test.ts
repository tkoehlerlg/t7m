import { Hono } from 'hono'
import { AbstractTransformer } from '../src'
import { t7mMiddleware } from '../src/hono'

interface User {
	id: number
	name: string
	email: string
	role: 'admin' | 'user'
}

interface PublicUser {
	name: string
	email: string
}

class UserTransformer extends AbstractTransformer<User, PublicUser> {
	data(input: User): PublicUser {
		return {
			name: input.name,
			email: input.email,
		}
	}

	includesMap = {} // No includes defined
}

const userTransformer = new UserTransformer()

new Hono().use('*', t7mMiddleware).get('/', async c => {
	const user: User = {
		id: 0,
		name: 'Test',
		email: 'test@mail.com',
		role: 'user',
	}
	c.transform(user, userTransformer, {
		wrapper: data => ({
			data: data,
		}),
	})
})
