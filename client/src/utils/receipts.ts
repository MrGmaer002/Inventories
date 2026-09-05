import type { Sale, Settings, ShiftReport } from '../../../shared/src/index.ts';
import i18n from '../i18n/index.ts';

function t(key: string, vars?: Record<string, unknown>): string {
  return i18n.t(key, vars) as string;
}

function lineRow(label: string, value: string, bold = false, strong = false): string {
  const cls = [bold ? 'rw-bold' : '', strong ? 'rw-strong' : ''].join(' ');
  return `<div class="rw ${cls}"><span>${label}</span><span>${value}</span></div>`;
}

export function saleReceiptHtml(sale: Sale, settings: Settings): string {
  const currency = settings.currency;
  const money = (v: number): string => `${v.toFixed(2)} ${currency}`;
  return `
  <div class="rp">
    <div class="rp-h">
      <h3>${settings.storeName || 'PanCafe'}</h3>
      <div class="rp-sub">${t('receipt.saleTitle', { id: sale.invoiceNo })}</div>
      <div class="rp-small">${t('receipt.date')}: ${sale.date} | ${sale.time}</div>
      <div class="rp-small">${t('receipt.cashier')}: ${sale.cashierName}</div>
      <div class="rp-small">${t('receipt.customer')}: ${sale.customer}</div>
      <hr />
    </div>
    <table class="rp-t">
      <thead><tr><th class="ta-r">${t('receipt.item')}</th><th class="ta-c">${t('receipt.qty')}</th><th class="ta-l">${t('receipt.total')}</th></tr></thead>
      <tbody>
        ${sale.items
          .map(
            (it) =>
              `<tr><td>${it.name}</td><td class="ta-c">${it.qty} ${it.unit}</td><td class="ta-l">${it.total.toFixed(2)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
    <hr />
    <div class="rp-f">
      ${lineRow(t('receipt.subtotal'), money(sale.subtotal))}
      ${sale.discount > 0 ? lineRow(t('receipt.discount'), `-${money(sale.discount)}`) : ''}
      ${lineRow(t('receipt.netDue'), money(sale.total), true, true)}
      ${lineRow(t('receipt.paid'), money(sale.paid))}
      ${lineRow(t('receipt.change'), money(sale.change))}
    </div>
    <div class="rp-foot">${settings.receiptFooter ? `<p>${settings.receiptFooter}</p>` : ''}<p>${t('receipt.system')}</p></div>
  </div>`;
}

export function shiftReceiptHtml(report: ShiftReport, settings: Settings, isAdmin: boolean): string {
  const s = report.shift;
  const currency = settings.currency;
  const money = (v: number): string => `${v.toFixed(2)} ${currency}`;
  const items = report.items;
  const rows = items.length
    ? items
        .map((it) => `<tr><td>${it.name}</td><td class="ta-c">${it.qty} ${it.unit}</td><td class="ta-l">${it.total.toFixed(2)}</td></tr>`)
        .join('')
    : `<tr><td colspan="3" class="ta-c">${t('shift.noItems')}</td></tr>`;

  return `
  <div class="rp">
    <div class="rp-h">
      <h3>${settings.storeName || 'PanCafe'}</h3>
      <div class="rp-sub rp-box">${t('shift.closureReceiptTitle', { num: s.shiftNumber })}</div>
      <div class="rp-small">${t('receipt.date')}: ${s.startedAt ? new Date(s.startedAt).toLocaleDateString() : ''}</div>
      <div class="rp-small">${t('shift.closedByLabel')} ${s.closedBy || s.cashierName}</div>
      <hr />
    </div>
    <div class="rp-small rp-title">${t('shift.itemsExited')}</div>
    <table class="rp-t">
      <thead><tr><th class="ta-r">${t('receipt.item')}</th><th class="ta-c">${t('receipt.qty')}</th><th class="ta-l">${t('receipt.total')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr />
    <div class="rp-f">
      ${lineRow(t('shift.invoicesLabel'), String(report.totals.invoices))}
      ${lineRow(t('shift.expectedDrawer'), money(report.totals.revenue))}
      ${lineRow(t('shift.actualDrawer'), money(s.actualCash ?? report.totals.revenue), true, true)}
      ${s.shortage > 0 ? lineRow(t('shift.shortageRecorded'), `-${money(s.shortage)}`, true, false) : ''}
      ${s.surplus > 0 ? lineRow(t('shift.surplusRecorded'), `+${money(s.surplus)}`, true, false) : ''}
      ${s.shortage === 0 && s.surplus === 0 ? lineRow(t('shift.drawerStatus'), t('shift.matched')) : ''}
      ${
        isAdmin
          ? `${lineRow(t('report.cost'), money(report.totals.cost))}
             ${lineRow(t('shift.netProfit'), `${report.totals.profit >= 0 ? '+' : ''}${money(report.totals.profit)}`, true, false)}`
          : ''
      }
    </div>
    <div class="rp-sign">
      <div>${t('shift.closerSignature')}<span class="rp-line"></span></div>
      <div>${t('shift.managerSignature')}<span class="rp-line"></span></div>
    </div>
  </div>`;
}
