import NextAuth from "next-auth"

declare module "next-auth" {
    interface Session {
        accessToken?: string
        error?: string
        user: {
            name?: string | null
            email?: string | null
            image?: string | null
            id?: string
        }
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string
        refreshToken?: string
        accessTokenExpires?: number
        error?: string
        sub?: string
    }
}
