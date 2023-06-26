import "dotenv/config";
import Consul from "consul";
import { chains } from "orbiter-chaincore";

export const consul = process.env["CONSUL_HOST"]
    ? new Consul({
        host: process.env["CONSUL_HOST"],
        port: process.env["CONSUL_PORT"],
        secure: false,
        defaults: {
            token: process.env["CONSUL_TOKEN"],
        },
    })
    : null;

export async function watchConsulConfig(ctx: Context) {
    console.log("======== consul config init begin ========");
    const keys = [
        ...(await consul.kv.keys("maker/rule/config/common")),
    ];
    for (const key of keys) {
        try {
            await watchMakerConfig(ctx, key);
        } catch (e) {
            // TODO TG
            ctx.logger.error(e);
        }
    }
    console.log("======== consul config init end ========");
}

async function watchMakerConfig(ctx: Context, key: string) {
    return new Promise((resolve, reject) => {
        const watcher = consul.watch({ method: consul.kv.get, options: { key } });
        watcher.on("change", (data: any) => {
            if (!data?.Key) {
                ctx.logger.error(`Consul can't find key ${key}`, data);
                return;
            }
            console.log(`Configuration updated: ${data.Key}`);
            if (data.Value) {
                try {
                    const config = JSON.parse(data.Value);
                    if (key === "maker/rule/config/common/chain.json") {
                        updateChain(ctx, config);
                    }
                    resolve(config);
                } catch (e) {
                    ctx.logger.error(`Consul watch refresh config error: ${e.message} dataValue: ${data.Value}`);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        watcher.on("error", (err: Error) => {
            ctx.logger.error(`Consul watch ${key} error: `, err);
            resolve(null);
        });
    });
}

import localChain from './chains.json';

function convertChainConfig(env_prefix: string, chainList?: any[]): any[] {
    const chainConfigList = (chainList ? chainList : localChain);
    for (const chain of chainConfigList) {
        chain.rpc = chain.rpc || [];
        const apiKey =
            process.env[`${env_prefix}_CHAIN_API_KEY_${chain.internalId}`];
        const wpRpc = process.env[`${env_prefix}_WP_${chain.internalId}`];
        const hpRpc = process.env[`${env_prefix}_HP_${chain.internalId}`];
        if (chain.api && apiKey) {
            chain.api.key = apiKey;
        }
        if (wpRpc) {
            chain.rpc.unshift(wpRpc);
        }
        if (hpRpc) {
            chain.rpc.unshift(hpRpc);
        }
    }
    return JSON.parse(JSON.stringify(chainConfigList));
}

function updateChain(ctx: Context, config: any) {
    if (config && config.length && config.find(item => +item.internalId === 1 || +item.internalId === 5)) {
        const configs = <any>convertChainConfig("NODE_APP", config);
        if (chains.getAllChains() && (chains.getAllChains()).length) {
            compare(chains.getAllChains(), configs, function (msg) {
                ctx.logger.info(msg);
            });
        }
        refreshConfig(configs);
        ctx.logger.info(`update chain config success`);
    } else {
        ctx.logger.error(`update chain config fail`);
    }
}

function refreshConfig(chainConfigs: any[]) {
    chains.fill(chainConfigs);
}

function compare(obj1: any, obj2: any, cb: Function, superKey?: string) {
    if (obj1 instanceof Array && obj2 instanceof Array) {
        compareList(obj1, obj2, cb, superKey);
    } else if (typeof obj1 === "object" && typeof obj2 === "object") {
        compareObj(obj1, obj2, cb, superKey);
    }
}

function compareObj(obj1: any, obj2: any, cb: Function, superKey?: string) {
    for (const key in obj1) {
        if (obj1[key] instanceof Array) {
            compareList(obj1[key], obj2[key], cb, superKey ? `${superKey} ${key}` : key);
        } else if (typeof obj1[key] === "object") {
            compareObj(obj1[key], obj2[key], cb, superKey ? `${superKey} ${key}` : key);
        } else if (obj1[key] !== obj2[key]) {
            cb(`${superKey ? (superKey + " ") : ""}${key}:${obj1[key]} ==> ${obj2[key]}`);
        }
    }
}

function compareList(arr1: any[], arr2: any[], cb: Function, superKey?: string) {
    if (arr1.length !== arr2.length) {
        cb(`${superKey ? (superKey + " ") : ""}count:${arr1.length} ==> ${arr2.length}`);
        return;
    }
    for (let i = 0; i < arr1.length; i++) {
        if (typeof arr1[i] === "object") {
            compareObj(arr1[i], arr2[i], cb, superKey);
        } else if (arr1[i] !== arr2[i]) {
            cb(`${superKey ? (superKey + " ") : ""}${arr1[i]} ==> ${arr2[i]}`);
        }
    }
}
