import { URL } from 'url';

export class UrlService {
    static validateGoogleFlightsUrl(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname === 'www.google.com' && 
                   parsedUrl.pathname.includes('/travel/flights') &&
                   parsedUrl.searchParams.has('tfs');
        } catch {
            return false;
        }
    }

    static cleanUrl(url: string, underscoreCount: number = 11): string {
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (tfsMatch) {
            const tfsValue = tfsMatch[1];
            const cleanTfsValue = tfsValue.replace(/_+/g, '_'.repeat(underscoreCount));
            url = url.replace(tfsMatch[1], cleanTfsValue);
        }
        return url;
    }

    static countUnderscores(url: string): number {
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (!tfsMatch) return 0;
        return (tfsMatch[1].match(/_/g) || []).length;
    }

    static changeDateInUrl(url: string, oldDate: string, newDate: string): string {
        const tfsMatch = url.match(/tfs=([^&]*)/);
        if (!tfsMatch) return url;

        const tfsValue = tfsMatch[1];
        
        try {
            const decoded = Buffer.from(tfsValue, 'base64').toString('binary');
            const datePattern = new RegExp(oldDate.replace(/-/g, '[-]?'));
            const dateMatch = decoded.match(datePattern);
            
            if (dateMatch) {
                const newDecoded = decoded.replace(dateMatch[0], newDate);
                const newTfsValue = Buffer.from(newDecoded, 'binary')
                    .toString('base64')
                    .replace(/=+$/, '')
                    .replace(/\//g, '_');
                return url.replace(tfsValue, newTfsValue);
            }
        } catch (e) {
            console.error('Error changing date in URL:', e);
        }
        
        return url;
    }
}
