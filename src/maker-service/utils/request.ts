import { stringify } from "qs";
// import axios from "axios";
import fetch from "cross-fetch";
export async function HttpGet(url: string, params?: any, headers = {}) {
    if (params) {
        url = `${url}${url.includes("?") ? "&" : "?"}${stringify({
            ...params,
        })}`;
    }
    const response = await fetch(url, {
        headers: headers
    });
    return response.json();
}
export async function HttpPost(url: string, data: any = {}, headers = {}) {
    const response = await fetch(url, {
        method: "post",
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...headers
        },

        //make sure to serialize your JSON body
        body: JSON.stringify(data)
    })
    return response.json();
}
