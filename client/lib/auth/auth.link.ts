import { config } from "@/config/configuration";

export function genAuthURL(scopes: string):string {
    if (!scopes) {
        throw new Error('SCOPES_NOT_FOUND');
    }

    const scopeList = scopes.split(',').join('+');
    return `https://discord.com/oauth2/authorize?` +
    `client_id=${config.discord.clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(config.WEBSITE_URL+"/api/auth/discord/callback")}` +
    `&scope=${encodeURIComponent(scopeList)}`;
}

