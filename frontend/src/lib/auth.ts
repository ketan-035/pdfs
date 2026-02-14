
import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";


export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                    scope: "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly",
                },
            },
        }),
    ],
    callbacks: {
        async session({ session, token }) {
            if (session.user && token) {
                // @ts-ignore
                session.user.id = token.sub;

                // Restore user details (email, name, image) from the token if they exist
                // because we wrapped the user object in the token during jwt callback
                // @ts-ignore
                if (token.user) {
                    // @ts-ignore
                    session.user.name = token.user.name;
                    // @ts-ignore
                    session.user.email = token.user.email;
                    // @ts-ignore
                    session.user.image = token.user.image;
                }

                // @ts-ignore
                session.accessToken = token.accessToken;
                // @ts-ignore
                session.error = token.error;
            }
            return session;
        },
        async jwt({ token, account, user }) {
            // Initial sign in
            if (account && user) {
                return {
                    accessToken: account.access_token,
                    accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
                    refreshToken: account.refresh_token,
                    user,
                    sub: user.id,
                }
            }

            // Return previous token if the access token has not expired yet
            if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
                return token
            }

            // If no refresh token available, we cannot refresh.
            if (!token.refreshToken) {
                return { ...token, error: "RefreshAccessTokenError" }
            }

            // Access token has expired, try to update it
            return refreshAccessToken(token)
        }
    },
    session: {
        strategy: "jwt",
    },
    debug: true, // Enable debug logs
    secret: process.env.NEXTAUTH_SECRET,
};

async function refreshAccessToken(token: any) {
    try {
        const url =
            "https://oauth2.googleapis.com/token?" +
            new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                grant_type: "refresh_token",
                refresh_token: token.refreshToken,
            })

        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST",
        })

        const refreshedTokens = await response.json()

        if (!response.ok) {
            throw refreshedTokens
        }

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Fall back to old refresh token
        }
    } catch (error) {
        console.log(error)

        return {
            ...token,
            error: "RefreshAccessTokenError",
        }
    }
}
