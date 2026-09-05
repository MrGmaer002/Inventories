import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CATEGORIES, type Item } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { useStore } from '../store.tsx';
import { useCategoryLabel } from '../components/ui.tsx';
import { errText } from './Inventory.tsx';

interface ItemFormState {
  name: string;
  category: string;
  barcode: string;
  buyPrice: string;
  sellPrice: string;
  qty: string;
  minQty: string;
  unit: string;
  notes: string;
}

const EMPTY_FORM: ItemFormState = {
  name: '',
  category: 'general',
  barcode: '',
  buyPrice: '',
  sellPrice: '',
  qty: '0',
  minQty: '5',
  unit: 'قطعة',
  notes: ''
};

// ---------------------------------------------------------------------------
// Item form modal (add / edit)
// ---------------------------------------------------------------------------

export function ItemModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, getModalPayload, toast, sfx, bump } = useStore();
  const catLabel = useCategoryLabel();
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  const open = isOpen('item');
  const payload = getModalPayload('item') as { itemId?: string } | undefined;

  const categories = useMemo(() => DEFAULT_CATEGORIES.filter((c) => c.id !== 'cat_all'), []);

  useEffect(() => {
    if (!open) return;
    const itemId = payload?.itemId;
    setSaving(false);
    if (itemId) {
      let alive = true;
      Endpoints.items
        .list()
        .then((res) => {
          if (!alive) return;
          const it = res.items.find((x) => x.id === itemId);
          if (it) {
            setEditing(it);
            setForm({
              name: it.name,
              category: it.category,
              barcode: it.barcode,
              buyPrice: String(it.buyPrice),
              sellPrice: String(it.sellPrice),
              qty: String(it.qty),
              minQty: String(it.minQty),
              unit: it.unit,
              notes: it.notes
            });
          }
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const set = (k: keyof ItemFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast(t('itemForm.needName'), 'warning');
      return;
    }
    setSaving(true);
    const unit = form.unit.trim() || 'قطعة';
    const payloadData = {
      name: form.name.trim(),
      category: form.category,
      barcode: form.barcode.trim(),
      buyPrice: Number(form.buyPrice) || 0,
      sellPrice: Number(form.sellPrice) || 0,
      qty: Number(form.qty) || 0,
      minQty: Number(form.minQty) || 5,
      unit,
      notes: form.notes.trim()
    };
    try {
      if (editing) {
        await Endpoints.items.update(editing.id, payloadData);
        toast(t('itemForm.saved', { name: payloadData.name }), 'success');
      } else {
        await Endpoints.items.create(payloadData);
        toast(t('itemForm.created', { name: payloadData.name }), 'success');
      }
      sfx('click');
      closeModal('item');
      bump();
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('item')}>
      <div className="modal-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <i className="fas fa-box-open" /> {editing ? t('itemForm.editTitle', { name: editing.name }) : t('itemForm.addTitle')}
          </h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('item')}><i className="fas fa-xmark" /></button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="field span-2">
                <span>{t('itemForm.nameLabel')}</span>
                <input className="form-control" value={form.name} onChange={set('name')} placeholder={t('itemForm.namePh')} autoFocus />
              </label>
              <label className="field">
                <span>{t('itemForm.categoryLabel')}</span>
                <select className="form-select" value={form.category} onChange={set('category')}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{catLabel(c.id)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('itemForm.barcodeLabel')}</span>
                <input className="form-control" value={form.barcode} onChange={set('barcode')} placeholder={t('itemForm.barcodePh')} />
              </label>
              <label className="field">
                <span>{t('itemForm.buyPriceLabel')}</span>
                <input type="number" step="0.5" min="0" className="form-control" value={form.buyPrice} onChange={set('buyPrice')} />
              </label>
              <label className="field">
                <span>{t('itemForm.sellPriceLabel')}</span>
                <input type="number" step="0.5" min="0" className="form-control" value={form.sellPrice} onChange={set('sellPrice')} />
              </label>
              <label className="field">
                <span>{t('itemForm.qtyLabel')}</span>
                <input type="number" step="1" min="0" className="form-control" value={form.qty} onChange={set('qty')} />
              </label>
              <label className="field">
                <span>{t('itemForm.minQtyLabel')}</span>
                <input type="number" step="1" min="0" className="form-control" value={form.minQty} onChange={set('minQty')} />
              </label>
              <label className="field">
                <span>{t('itemForm.unitLabel')}</span>
                <input className="form-control" value={form.unit} onChange={set('unit')} />
              </label>
              <label className="field span-2">
                <span>{t('itemForm.notesLabel')} <em>{t('common.optional')}</em></span>
                <textarea className="form-control" rows={2} value={form.notes} onChange={set('notes')} placeholder={t('itemForm.notesPh')} />
              </label>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => closeModal('item')}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-floppy-disk" />} {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock-in modal
// ---------------------------------------------------------------------------

export function StockInModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, getModalPayload, toast, bump, sfx } = useStore();
  const [item, setItem] = useState<Item | null>(null);
  const [qty, setQty] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);

  const open = isOpen('stockin');
  const payload = getModalPayload('stockin') as { itemId?: string } | undefined;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Endpoints.items
      .list()
      .then((res) => {
        if (!alive) return;
        const it = res.items.find((x) => x.id === payload?.itemId);
        if (it) {
          setItem(it);
          setQty('10');
          setUnitCost(String(it.buyPrice));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, payload?.itemId]);

  if (!open) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!item) return;
    const q = Number(qty);
    if (!(q > 0)) {
      toast(t('stockin.invalidQty'), 'error');
      return;
    }
    setSaving(true);
    try {
      const cost = Number(unitCost);
      await Endpoints.items.stockIn(item.id, q, cost > 0 ? cost : undefined);
      toast(t('stockin.added', { qty: q, unit: item.unit, name: item.name }), 'success');
      sfx('click');
      closeModal('stockin');
      bump();
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('stockin')}>
      <div className="modal-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><i className="fas fa-truck-loading" /> {t('stockin.title')}</h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('stockin')}><i className="fas fa-xmark" /></button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <div className="modal-body">
            {item ? (
              <div className="item-summary">
                <div>
                  <span className="text-muted">{t('stockin.itemLabel')}:</span> <strong>{item.name}</strong>
                </div>
                <div className="text-muted small">
                  {t('stockin.currentQty')}: <strong className="text-success">{item.qty} {item.unit}</strong>
                </div>
              </div>
            ) : (
              <div className="text-muted">{t('common.loading')}</div>
            )}
            <div className="form-grid">
              <label className="field">
                <span>{t('stockin.qtyLabel')}</span>
                <input type="number" min="1" step="1" className="form-control" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>{t('stockin.costLabel')}</span>
                <input type="number" step="0.5" min="0" className="form-control" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => closeModal('stockin')}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-success" disabled={saving || !item}>
              {saving ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-plus" />} {t('common.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
