import { template } from "lodash";
import Context from "../context";
import { HttpGet } from "../utils/request"
const config = {
    endpoint: 'https://utf8api.smschinese.cn/',
    uid: 'zu19890223',
};
export enum SMSTemplate {
    SendTransactionError = 'Send transaction error: chain=<%= chain %>, msg=<%= msg %>'
}
export class SMSService {
    constructor(private readonly ctx: Context) {
    }
    async sendAlert(templateId: keyof typeof SMSTemplate, params: any = {}) {
        const compiled = template(SMSTemplate[templateId]);
        const smsText = compiled(params);
        console.log('smsText ：', smsText);
        const Key = process.env['sms_key'];
        const smsMob = process.env['sms_numbers'];
        if (!Key || !smsMob) {
            return console.error('Missing configuration for sending short message notification');
        }
        const query = {
            Uid: config.uid,
            Key,
            smsMob,
            smsText,
        }
        const rest = await HttpGet(config.endpoint, query);
        this.ctx.logger.info(`SMS Send Alert:${smsText}`);
        return rest;
    }
}

