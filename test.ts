type MyOmit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] }

type User = {
    id: number
    name: string
    email: string
}

type A = MyOmit<User, 'id'>

// type B = 'id' | 'name'

type B = User['id']
