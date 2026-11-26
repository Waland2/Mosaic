export interface HelloPluginSettings {
    enhancedTables: boolean;
    tableSeparators: string[];
}

export const DEFAULT_SETTINGS: HelloPluginSettings = {
    enhancedTables: false,
    tableSeparators: ["-", "|"]
};
