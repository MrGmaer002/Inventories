import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CartLine, Item } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { useStore } from '../store.tsx';
import { useMoney } from '../components/ui.tsx';
import { saleReceiptHtml } from '../utils/receipts.ts';
import { errText } from './Inventory.tsx';

export function PosModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, getModalPayload, settings, toast, sfx, bump, requestPrint } = useStore();
  const money = useMoney();

  const open = isOpen('pos');
  const payload = getModalPayload('pos') as { quickAddId?: string } | undefined;

  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);

  // Load inventory each time the modal opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Endpoints.items
      .list()
      .then((res) => {
        if (alive) setItems(res.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  // Reset the cart when the modal opens.
  useEffect(() => {
    if (open) {
      setCart([]);
      setCustomer('');
      setDiscount('');
      setPaid('');
    }
  }, [open]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.total, 0);
    const discountValue = Math.max(0, Number(discount) || 0);
    const total = Math.max(0, subtotal - discountValue);
    const paidValue = paid === '' ? total : Number(paid) || 0;
    const change = Math.max(0, paidValue - total);
    return { subtotal, discount: discountValue, total, paid: paidValue, change, count: cart.reduce((s, l) => s + l.qty, 0) };
  }, [cart, discount, paid]);

  const stockOf = (id: string): number => Number(items.find((i) => i.id === id)?.qty) || 0;

  const addToCart = (item: Item, qtyDelta = 1): void => {
    if (busy) return;
    const stock = Number(item.qty) || 0;
    if (stock <= 0) {
      toast(t('pos.notAvailable'), 'warning');
      return;
    }
    setCart((prev) => {
      const line = prev.find((l) => l.itemId === item.id);
      const wanted = (line ? line.qty : 0) + qtyDelta;
      if (wanted > stock) {
        toast(t('pos.exceedsStock', { stock }), 'warning');
        return prev;
      }
      if (wanted <= 0) return prev.filter((l) => l.itemId !== item.id);
      if (line) {
        return prev.map((l) =>
          l.itemId === item.id ? { ...l, qty: wanted, total: wanted * l.price } : l
        );
      }
      const sell = Number(item.sellPrice) || 0;
      const buy = Number(item.buyPrice) || 0;
      const l: CartLine = {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qty: wanted,
        price: sell,
        buyPrice: buy,
        total: sell * wanted,
        maxQty: stock
      };
      return [...prev, l];
    });
  };

  const updateQty = (itemId: string, qtyValue: number): void => {
    const stock = stockOf(itemId);
    if (Number.isNaN(qtyValue) || qtyValue <= 0) {
      setCart((prev) => prev.filter((l) => l.itemId !== itemId));
      return;
    }
    if (qtyValue > stock) {
      toast(t('pos.exceedsStock', { stock }), 'warning');
      qtyValue = stock;
    }
    setCart((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, qty: qtyValue, total: qtyValue * l.price } : l))
    );
  };

  // Auto-add a product when opened through a quick-sell button.
  const autoAdded = useRef<string | null>(null);
  useEffect(() => {
    if (open && payload?.quickAddId && payload.quickAddId !== autoAdded.current) {
      autoAdded.current = payload.quickAddId;
      const it = items.find((i) => i.id === payload.quickAddId);
      if (it) {
        addToCart(it, 1);
        setCustomer('');
      }
    }
    if (!open) autoAdded.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, payload?.quickAddId]);

  if (!open) return null;

  const checkout = async (): Promise<void> => {
    if (cart.length === 0) {
      toast(t('pos.emptyCartError'), 'error');
      return;
    }
    setBusy(true);
    try {
      const sale = await Endpoints.checkout({
        customer: customer.trim() || t('pos.cashCustomer'),
        discount: totals.discount,
        paid: paid === '' ? undefined : totals.paid,
        items: cart.map((l) => ({ ...l }))
      });
      sfx('cash');
      toast(t('pos.invoiceDone', { id: sale.sale.invoiceNo, total: money(sale.sale.total) }), 'success');
      closeModal('pos');
      bump();
      if (settings.autoPrint) {
        window.setTimeout(() => requestPrint(saleReceiptHtml(sale.sale, settings)), 350);
      }
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay-layer pos-layer" onMouseDown={() => closeModal('pos')}>
      <div className="modal-panel modal-xl pos-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><i className="fas fa-cash-register" /> {t('pos.title')}</h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('pos')}><i className="fas fa-xmark" /></button>
        </div>

        <div className="pos-layout">
          {/* Product picker */}
          <div className="pos-picker">
            <div className="pos-picker-title"><i className="fas fa-hand-pointer" /> {t('pos.pickHint')}</div>
            <div className="pos-picker-grid">
              {items.length === 0 ? (
                <div className="pos-empty">{t('inv.emptyWarehouse')}</div>
              ) : (
                items.map((it) => {
                  const stock = Number(it.qty) || 0;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`pos-tile ${stock <= 0 ? 'out' : ''}`}
                      disabled={stock <= 0 || busy}
                      onClick={() => addToCart(it, 1)}
                    >
                      <i className={it.icon || 'fas fa-box'} />
                      <strong>{it.name}</strong>
                      <span className="pos-tile-price">{money(it.sellPrice)}</span>
                      <span className="pos-tile-stock">{t('pos.stockLeft', { qty: stock, unit: it.unit })}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="pos-cart">
            <div className="pos-cart-head">
              <strong><i className="fas fa-cart-shopping" /> {t('pos.cart')} ({totals.count})</strong>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => setCart([])} disabled={busy}>
                {t('pos.clearCart')}
              </button>
            </div>

            <div className="pos-cart-list">
              {cart.length === 0 ? (
                <div className="pos-cart-empty">
                  <i className="fas fa-basket-shopping" />
                  <p>{t('pos.cartEmpty')}</p>
                </div>
              ) : (
                cart.map((line) => (
                  <div className="cart-row" key={line.itemId}>
                    <div className="cart-info">
                      <strong>{line.name}</strong>
                      <small>{money(line.price)} × {line.qty} {line.unit}</small>
                    </div>
                    <div className="qty-stepper">
                      <button type="button" className="qty-btn minus" disabled={busy} onClick={() => updateQty(line.itemId, line.qty - 1)}>
                        <i className="fas fa-minus" />
                      </button>
                      <input
                        className="form-control qty-input"
                        type="number"
                        min={1}
                        value={line.qty}
                        disabled={busy}
                        onChange={(e) => updateQty(line.itemId, Number(e.target.value))}
                      />
                      <button type="button" className="qty-btn plus" disabled={busy} onClick={() => updateQty(line.itemId, line.qty + 1)}>
                        <i className="fas fa-plus" />
                      </button>
                    </div>
                    <strong className="cart-line-total">{money(line.total)}</strong>
                    <button type="button" className="icon-btn sm danger" disabled={busy} onClick={() => setCart((p) => p.filter((l) => l.itemId !== line.itemId))}>
                      <i className="fas fa-trash-can" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pos-form-grid">
              <label className="field">
                <span>{t('pos.customerLabel')}</span>
                <input className="form-control" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={t('pos.cashCustomer')} disabled={busy} />
              </label>
              <label className="field">
                <span>{t('pos.discountLabel')} ({settings.currency})</span>
                <input type="number" min={0} className="form-control" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>{t('pos.paidLabel')}</span>
                <input type="number" min={0} className="form-control" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={t('pos.paidPh')} disabled={busy} />
              </label>
              <div className="field change-box">
                <span>{t('pos.changeLabel')}</span>
                <strong>{money(totals.change)}</strong>
              </div>
            </div>

            <div className="pos-totals">
              <div><span>{t('pos.subtotal')}</span><span>{money(totals.subtotal)}</span></div>
              <div className="net"><span>{t('pos.netDue')}</span><strong>{money(totals.total)}</strong></div>
            </div>

            <button type="button" className="btn btn-primary btn-lg btn-block pos-checkout" disabled={cart.length === 0 || busy} onClick={() => void checkout()}>
              {busy ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-circle-check" />} {t('pos.checkout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
