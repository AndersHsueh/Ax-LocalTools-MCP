/**
 * 时间工具模块
 * 提供获取当前时间的能力，支持多种格式与时区
 */

class TimeTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args = {}) {
    const {
      format = 'iso',
      time_zone: timeZone,
      include_milliseconds: includeMilliseconds = true,
      output_format = 'both'
    } = args;

    const now = new Date();

    const result = this.buildTimeResponse(now, { format, timeZone, includeMilliseconds });

    if (output_format === 'json') {
      return { content: [{ type: 'json', json: result.json }] };
    } else if (output_format === 'text') {
      return { content: [{ type: 'text', text: result.text }] };
    }
    return { content: [ { type: 'text', text: result.text }, { type: 'json', json: result.json } ] };
  }

  buildTimeResponse(dateObj, options) {
    const { format, timeZone, includeMilliseconds } = options;

    // ISO 基准时间总是以 UTC 表示
    const iso = includeMilliseconds ? dateObj.toISOString() : new Date(Math.floor(dateObj.getTime() / 1000) * 1000).toISOString();

    // Unix 时间戳（秒/毫秒）
    const unixSeconds = Math.floor(dateObj.getTime() / 1000);
    const unixMilliseconds = dateObj.getTime();

    // 本地与指定时区格式化
    const locale = this.formatWithIntl(dateObj, undefined, includeMilliseconds);
    const zoned = this.formatWithIntl(dateObj, timeZone, includeMilliseconds);

    // RFC3339 与 ISO 基本一致（这里沿用 ISO 输出）
    const rfc3339 = iso;

    // 选择主显示文本
    let primaryText;
    switch ((format || '').toLowerCase()) {
      case 'unix':
        primaryText = `当前时间（UNIX）: ${unixSeconds}`;
        break;
      case 'unix_ms':
        primaryText = `当前时间（UNIX 毫秒）: ${unixMilliseconds}`;
        break;
      case 'locale':
        primaryText = `当前时间（本地）: ${locale}`;
        break;
      case 'rfc3339':
        primaryText = `当前时间（RFC3339）: ${rfc3339}`;
        break;
      case 'iso':
      default:
        primaryText = `当前时间（ISO）: ${iso}`;
        break;
    }

    const json = {
      iso,
      rfc3339,
      unix_seconds: unixSeconds,
      unix_milliseconds: unixMilliseconds,
      local: locale,
      time_zone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      zoned_time: zoned
    };

    return { text: primaryText, json };
  }

  formatWithIntl(dateObj, timeZone, includeMilliseconds) {
    try {
      const resolvedTz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: resolvedTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(dateObj);

      const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const ms = includeMilliseconds ? `.${String(dateObj.getMilliseconds()).padStart(3, '0')}` : '';
      // 统一输出格式：YYYY-MM-DD HH:mm:ss(.SSS) [TZ]
      return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}${ms} [${resolvedTz}]`;
    } catch (e) {
      // 回退到默认 toString
      return dateObj.toString();
    }
  }
}

module.exports = TimeTool;


