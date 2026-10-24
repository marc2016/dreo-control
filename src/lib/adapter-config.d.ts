// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** E-mail address of the Dreo account */
            email: string;
            /** Password of the Dreo account (stored encrypted) */
            password: string;
            /** Dreo cloud region */
            region: 'eu' | 'us';
            /** Fallback polling interval in seconds */
            refreshInterval: number;
            /** Receive real-time updates via WebSocket */
            useWebSocket: boolean;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
