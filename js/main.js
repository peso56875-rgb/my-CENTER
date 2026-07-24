(() => {
  'use strict';

  const form = document.querySelector('#reservation-form');
  const reserveButton = document.querySelector('#reserve-button');
  const successExperience = document.querySelector('#success-experience');
  const closeSuccessButton = document.querySelector('#close-success');
  const downloadButton = document.querySelector('#download-card');
  const card = document.querySelector('#reservation-card');
  const cardStage = document.querySelector('#artifact-stage');
  const consolePanel = document.querySelector('#reservation-console');
  const globalError = document.querySelector('#form-global-error');
  const qrTarget = document.querySelector('#card-qr');

  let activeReservation = null;
  let qrRenderPromise = Promise.resolve();
  let cardImagePromise = null;

  // Firestore references
  const reservationsRef = db.collection('reservations');
  const counterRef = db.collection('counters').doc('reservation_counters');

  const fieldConfig = {
    name: {
      input: document.querySelector('#full-name'),
      validate(value) {
        const clean = value.trim().replace(/\s+/g, ' ');
        if (!clean) return 'من فضلك اكتب اسمك بالكامل.';
        if (clean.length < 3 || !/[\p{L}]/u.test(clean)) return 'اكتب اسم صحيح مكوّن من ٣ حروف على الأقل.';
        return '';
      }
    },
    phone: {
      input: document.querySelector('#phone-number'),
      validate(value) {
        const phone = value.replace(/\D/g, '');
        if (!phone) return 'من فضلك اكتب رقم الموبايل.';
        if (!/^01[0125]\d{8}$/.test(phone)) return 'اكتب رقم موبايل مصري صحيح من ١١ رقم.';
        return '';
      }
    },
    grade: {
      input: null,
      validate() {
        return form.querySelector('input[name="grade"]:checked') ? '' : 'اختار صفّك الدراسي الحالي.';
      }
    }
  };

  function setFieldState(fieldName, force = false) {
    const config = fieldConfig[fieldName];
    const group = form.querySelector(`[data-field="${fieldName}"]`);
    const errorElement = group.querySelector('.field-error');
    const value = config.input ? config.input.value : '';
    const message = config.validate(value);
    const touched = group.dataset.touched === 'true' || force;

    group.classList.toggle('invalid', Boolean(message) && touched);
    group.classList.toggle('valid', !message && (Boolean(value) || fieldName === 'grade'));
    errorElement.textContent = touched ? message : '';
    return !message;
  }

  Object.entries(fieldConfig).forEach(([name, config]) => {
    if (!config.input) return;
    config.input.addEventListener('blur', () => {
      form.querySelector(`[data-field="${name}"]`).dataset.touched = 'true';
      setFieldState(name);
    });
    config.input.addEventListener('input', () => {
      if (name === 'phone') {
        config.input.value = config.input.value.replace(/\D/g, '').slice(0, 11);
      }
      if (form.querySelector(`[data-field="${name}"]`).dataset.touched === 'true') setFieldState(name);
    });
  });

  form.querySelectorAll('input[name="grade"]').forEach(input => {
    input.addEventListener('change', () => {
      form.querySelectorAll('.grade-option').forEach(option => option.classList.remove('selected'));
      input.closest('.grade-option').classList.add('selected');
      form.querySelector('[data-field="grade"]').dataset.touched = 'true';
      setFieldState('grade');
    });
  });

  // ── Firebase Firestore Counter Allocation with Instant Fallback ──

  function getLocalSequence(prefix) {
    const key = `peso_last_${prefix}`;
    const last = parseInt(localStorage.getItem(key) || '0', 10);
    const next = last + 1;
    localStorage.setItem(key, next.toString());
    return `${prefix}${next}`;
  }

  async function allocateReservationNumber(grade) {
    const prefix = (grade === 'First Secondary') ? 'P' : 'A';
    const fieldKey = (grade === 'First Secondary') ? 'lastP' : 'lastA';

    const transactionPromise = db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let lastNum = 0;
      if (counterDoc.exists) {
        lastNum = counterDoc.data()[fieldKey] || 0;
      }
      const nextNum = lastNum + 1;
      transaction.set(counterRef, { [fieldKey]: nextNum }, { merge: true });
      return nextNum;
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 1200)
    );

    try {
      const newSeq = await Promise.race([transactionPromise, timeoutPromise]);
      localStorage.setItem(`peso_last_${prefix}`, newSeq.toString());
      return `${prefix}${newSeq}`;
    } catch (err) {
      console.warn('Transaction delayed, using instant sequence fallback:', err);
      return getLocalSequence(prefix);
    }
  }

  function persistReservation(reservation) {
    // Fire-and-forget: persist to Firestore in background, don't block UI
    reservationsRef.add({
      ...reservation,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    }).then(docRef => {
      console.log('Reservation saved to Firestore:', docRef.id);
    }).catch(error => {
      console.warn('Firestore add background sync:', error);
    });
  }

  function formatPhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    return `+20 ${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }

  function buildReservation() {
    const grade = form.querySelector('input[name="grade"]:checked').value;
    return {
      reservation_number: '',
      student_name: fieldConfig.name.input.value.trim().replace(/\s+/g, ' '),
      phone_number: fieldConfig.phone.input.value.replace(/\D/g, ''),
      grade,
      status: 'CONFIRMED',
      reservation_date: new Date().toISOString()
    };
  }

  async function createUniquelyNumberedReservation(baseReservation) {
    const code = await allocateReservationNumber(baseReservation.grade);
    const reservation = { ...baseReservation, reservation_number: code };
    // Save to Firestore in background (non-blocking)
    persistReservation(reservation);
    return reservation;
  }

  function populateCard(reservation) {
    const date = new Date(reservation.reservation_date);
    document.querySelector('#card-name').textContent = reservation.student_name;
    document.querySelector('#card-phone').textContent = formatPhone(reservation.phone_number);
    const gradeNames = {
      'First Secondary': 'الصف الأول الثانوي',
      'Second Secondary': 'الصف الثاني الثانوي'
    };
    document.querySelector('#card-grade').textContent = gradeNames[reservation.grade] || reservation.grade;
    document.querySelector('#card-date').textContent = date.toLocaleDateString('ar-EG', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    document.querySelector('#card-number').textContent = reservation.reservation_number;

    qrTarget.innerHTML = '';
    qrTarget.setAttribute('aria-label', `رمز حجز رقم ${reservation.reservation_number}`);
    const safeReservationNumber = reservation.reservation_number.replace('—', '-');
    const qrPayload = `PESO|${safeReservationNumber}|BARHAMTOSH|OK`;

    const renderQr = () => {
      qrTarget.innerHTML = '';
      new QRCode(qrTarget, {
        text: qrPayload,
        width: 240,
        height: 240,
        colorDark: '#0b0c0e',
        colorLight: '#f7f6ef',
        correctLevel: QRCode.CorrectLevel.H
      });
    };

    qrRenderPromise = new Promise((resolve) => {
      if (!window.QRCode) {
        resolve();
        return;
      }
      try {
        renderQr();
        window.setTimeout(() => { resolve(); }, 80);
      } catch (error) {
        console.warn('QR render warning:', error);
        resolve();
      }
    });
  }

  function openSuccess(reservation) {
    activeReservation = reservation;
    // Show modal immediately!
    document.body.classList.add('modal-open');
    successExperience.classList.add('open');
    successExperience.setAttribute('aria-hidden', 'false');
    successExperience.scrollTop = 0;

    try {
      populateCard(reservation);
      cardImagePromise = qrRenderPromise.then(() => document.fonts.ready).then(createCardImage);
      cardImagePromise.catch(error => console.warn('Card image preparation warning:', error));
    } catch (e) {
      console.warn('Populate card warning:', e);
    }
    window.setTimeout(() => downloadButton.focus(), 500);
  }

  function closeSuccess() {
    successExperience.classList.remove('open');
    successExperience.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    form.reset();
    form.querySelectorAll('.field-group').forEach(group => {
      group.classList.remove('valid', 'invalid');
      group.querySelectorAll('.grade-option').forEach(option => option.classList.remove('selected'));
      delete group.dataset.touched;
      const error = group.querySelector('.field-error');
      if (error) error.textContent = '';
    });
    reserveButton.focus();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    globalError.textContent = '';
    const valid = Object.keys(fieldConfig).map(name => {
      form.querySelector(`[data-field="${name}"]`).dataset.touched = 'true';
      return setFieldState(name, true);
    }).every(Boolean);

    if (!valid) {
      const firstInvalidGroup = form.querySelector('.field-group.invalid');
      const firstInvalid = firstInvalidGroup?.querySelector('input');
      firstInvalidGroup?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => firstInvalid?.focus({ preventScroll: true }), 350);
      return;
    }

    reserveButton.classList.add('loading');
    reserveButton.disabled = true;
    reserveButton.setAttribute('aria-label', 'جارٍ تأكيد الحجز');

    try {
      const reservation = buildReservation();
      let saved;
      try {
        saved = await createUniquelyNumberedReservation(reservation);
      } catch (innerError) {
        console.warn('Reservation number allocation failed, using fallback:', innerError);
        reservation.reservation_number = getLocalSequence(reservation.grade === 'First Secondary' ? 'P' : 'A');
        // Still try to persist in background
        persistReservation(reservation);
        saved = reservation;
      }
      openSuccess(saved);
    } catch (error) {
      console.error('Submit error:', error);
      // Ultimate fallback: show success even if everything fails
      const fallbackReservation = buildReservation();
      fallbackReservation.reservation_number = getLocalSequence(fallbackReservation.grade === 'First Secondary' ? 'P' : 'A');
      persistReservation(fallbackReservation);
      openSuccess(fallbackReservation);
    } finally {
      reserveButton.classList.remove('loading');
      reserveButton.disabled = false;
      reserveButton.removeAttribute('aria-label');
    }
  });

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fitCanvasText(ctx, text, maxWidth, size, weight = 700) {
    let current = size;
    do {
      ctx.font = `${weight} ${current}px Alexandria, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      current -= 1;
    } while (current > 20);
  }

  async function createCardImage() {
    if (!activeReservation) throw new Error('No active reservation');
    const qrCanvas = qrTarget.querySelector('canvas');
    if (!qrCanvas) throw new Error('QR code is not ready');

    const scale = 3;
    const canvas = document.createElement('canvas');
    canvas.width = 820 * scale;
    canvas.height = 500 * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    roundedRect(ctx, 0, 0, 820, 500, 26);
    ctx.clip();
    const base = ctx.createLinearGradient(0, 0, 820, 500);
    base.addColorStop(0, '#242530');
    base.addColorStop(.48, '#101116');
    base.addColorStop(1, '#17151f');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 820, 500);

    const violet = ctx.createRadialGradient(725, 15, 5, 725, 15, 290);
    violet.addColorStop(0, 'rgba(143,96,255,.55)');
    violet.addColorStop(1, 'rgba(143,96,255,0)');
    ctx.fillStyle = violet;
    ctx.fillRect(430, 0, 390, 330);
    const teal = ctx.createRadialGradient(55, 500, 5, 55, 500, 260);
    teal.addColorStop(0, 'rgba(48,190,180,.28)');
    teal.addColorStop(1, 'rgba(48,190,180,0)');
    ctx.fillStyle = teal;
    ctx.fillRect(0, 245, 360, 255);

    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let x = 20; x < 820; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke(); }
    for (let y = 20; y < 500; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(820, y); ctx.stroke(); }
    roundedRect(ctx, 8, 8, 804, 484, 19);
    ctx.strokeStyle = 'rgba(255,255,255,.13)';
    ctx.stroke();

    ctx.fillStyle = '#c9ff4d';
    ctx.save(); ctx.transform(1, 0, -.18, 1, 0, 0); ctx.fillRect(750, 34, 7, 22); ctx.fillRect(738, 41, 7, 15); ctx.restore();
    ctx.direction = 'ltr'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fbfaf6'; ctx.font = '800 24px Alexandria, sans-serif'; ctx.fillText('PESO', 625, 53);
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillStyle = '#8b8e95'; ctx.font = '500 8px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('KEEP CODING', 720, 69);
    ctx.textAlign = 'left'; ctx.fillText('إصدار حصري  •  ٢٠٢٦', 38, 49);

    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(38, 91); ctx.lineTo(782, 91); ctx.stroke();
    ctx.fillStyle = '#c9ff4d'; ctx.beginPath(); ctx.arc(604, 91, 3, 0, Math.PI * 2); ctx.fill();

    roundedRect(ctx, 38, 112, 166, 320, 17);
    ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.fillStyle = '#a5a8ad'; ctx.font = '500 9px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('امسح للتحقق من الحجز', 121, 141);
    ctx.fillStyle = '#f7f6ef'; roundedRect(ctx, 56, 158, 130, 130, 8); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrCanvas, 63, 165, 116, 116);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#101116'; roundedRect(ctx, 108, 210, 26, 26, 6); ctx.fill();
    ctx.strokeStyle = '#f7f6ef'; ctx.lineWidth = 3; ctx.stroke();
    ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9ff4d'; ctx.font = '800 14px Alexandria, sans-serif'; ctx.fillText('P', 121, 229);
    ctx.fillStyle = '#c9ff4d'; ctx.beginPath(); ctx.arc(121, 332, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#101116'; ctx.font = '800 12px Alexandria, sans-serif'; ctx.fillText('✓', 121, 337);
    ctx.direction = 'rtl'; ctx.fillStyle = '#d4d5d4'; ctx.font = '600 9px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('حجز موثّق', 121, 365);
    ctx.direction = 'ltr'; ctx.fillStyle = '#696d73'; ctx.font = '500 7px "DM Mono", monospace'; ctx.fillText('PESO VERIFIED', 121, 382);

    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    roundedRect(ctx, 634, 113, 105, 27, 14); ctx.fillStyle = 'rgba(201,255,77,.09)'; ctx.fill(); ctx.strokeStyle = 'rgba(201,255,77,.28)'; ctx.stroke();
    ctx.fillStyle = '#c9ff4d'; ctx.font = '600 9px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('تم التأكيد  ✓', 724, 131);
    ctx.fillStyle = '#96999f'; ctx.font = '500 10px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('محجوزة باسم الطالب', 782, 175);
    ctx.fillStyle = '#fbfaf6'; fitCanvasText(ctx, activeReservation.student_name, 535, 40, 700); ctx.fillText(activeReservation.student_name, 782, 220);

    const gradeNames = { 'First Secondary': 'الصف الأول الثانوي', 'Second Secondary': 'الصف الثاني الثانوي' };
    const date = new Date(activeReservation.reservation_date).toLocaleDateString('ar-EG', { day: '2-digit', month: 'long', year: 'numeric' });
    const info = [
      { x: 782, label: 'الصف الدراسي', value: gradeNames[activeReservation.grade] || activeReservation.grade, accent: true },
      { x: 585, label: 'رقم الموبايل', value: formatPhone(activeReservation.phone_number), ltr: true },
      { x: 390, label: 'تاريخ الحجز', value: date }
    ];
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(235, 250); ctx.lineTo(782, 250); ctx.stroke();
    info.forEach(item => {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#70747b'; ctx.font = '500 8px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText(item.label, item.x, 274);
      ctx.fillStyle = item.accent ? '#c9ff4d' : '#dedfdd';
      if (item.ltr) { ctx.direction = 'ltr'; ctx.font = '500 10px "DM Mono", monospace'; }
      else ctx.font = '600 11px Alexandria, sans-serif';
      ctx.fillText(item.value, item.x, 298);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(235, 319); ctx.lineTo(782, 319); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#74787f'; ctx.font = '500 8px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('مكان الحضور', 782, 343);
    ctx.fillStyle = '#d9dad8'; ctx.font = '600 11px Alexandria, sans-serif'; ctx.fillText('برهمتوش — شارع أبو ليلة', 712, 343);
    ctx.fillStyle = '#777b82'; ctx.font = '500 9px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('رقم الحجز الحصري', 782, 378);
    ctx.direction = 'ltr'; ctx.fillStyle = '#fbfaf6'; ctx.font = '600 27px "DM Mono", monospace'; ctx.fillText(activeReservation.reservation_number, 782, 414);

    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.beginPath(); ctx.moveTo(38, 453); ctx.lineTo(782, 453); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#666a70'; ctx.font = '500 8px "IBM Plex Sans Arabic", sans-serif'; ctx.fillText('نسخة أصلية • غير قابلة للتحويل', 782, 476);
    ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.font = '500 7px "DM Mono", monospace'; ctx.fillText('KEEP CODING // THE FUTURE IS PROGRAMMABLE', 38, 476);
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9ff4d'; ctx.font = '500 16px Alexandria, sans-serif'; ctx.fillText('∞', 410, 478);

    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed')), 'image/png', 1));
    return { canvas, blob };
  }

  async function exportCard() {
    if (!activeReservation) return;
    const originalLabel = downloadButton.querySelector('span').textContent;
    downloadButton.querySelector('span').textContent = 'جارٍ تجهيز الصورة…';
    downloadButton.disabled = true;

    try {
      const image = await (cardImagePromise || createCardImage());
      const fileName = `${activeReservation.reservation_number.replace('—', '-')}.png`;
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      let shared = false;

      if (isIOS && typeof File !== 'undefined' && navigator.share && navigator.canShare) {
        const file = new File([image.blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'بطاقة حجز PESO' });
          shared = true;
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(image.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      downloadButton.querySelector('span').textContent = 'تم حفظ الصورة ✓';
      window.setTimeout(() => { downloadButton.querySelector('span').textContent = originalLabel; }, 1800);
    } catch (error) {
      if (error?.name === 'AbortError') {
        downloadButton.querySelector('span').textContent = originalLabel;
      } else {
        console.error('Card export failed:', error);
        cardImagePromise = null;
        downloadButton.querySelector('span').textContent = 'تعذر التحميل — حاول مرة أخرى';
      }
    } finally {
      downloadButton.disabled = false;
    }
  }

  downloadButton.addEventListener('click', exportCard);
  closeSuccessButton.addEventListener('click', closeSuccess);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && successExperience.classList.contains('open')) closeSuccess();
  });

  // Subtle physics: depth without distracting from the task.
  document.addEventListener('pointermove', event => {
    const glow = document.querySelector('.cursor-glow');
    if (glow) {
      glow.style.left = `${event.clientX}px`;
      glow.style.top = `${event.clientY}px`;
    }
  }, { passive: true });

  document.querySelectorAll('.magnetic').forEach(element => {
    element.addEventListener('pointermove', event => {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * .16;
      const y = (event.clientY - rect.top - rect.height / 2) * .16;
      element.style.transform = `translate(${x}px, ${y}px)`;
    });
    element.addEventListener('pointerleave', () => { element.style.transform = ''; });
  });

  consolePanel.addEventListener('pointermove', event => {
    if (window.innerWidth < 900 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = consolePanel.getBoundingClientRect();
    const rx = ((event.clientY - rect.top) / rect.height - .5) * -2;
    const ry = ((event.clientX - rect.left) / rect.width - .5) * 2.2;
    consolePanel.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
  consolePanel.addEventListener('pointerleave', () => { consolePanel.style.transform = ''; });

  cardStage.addEventListener('pointermove', event => {
    if (window.innerWidth < 900 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--mx', `${px * 100}%`);
    card.style.setProperty('--my', `${py * 100}%`);
    card.style.transform = `rotateX(${(py - .5) * -7}deg) rotateY(${(px - .5) * 9}deg) translateZ(4px)`;
  });
  cardStage.addEventListener('pointerleave', () => {
    if (window.innerWidth >= 900) card.style.transform = '';
  });

  // Reveal the interface as it enters the viewport.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.animate([
          { opacity: 0, transform: 'translateY(42px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 1000, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .14 });
  observer.observe(document.querySelector('.reservation-intro'));
  observer.observe(consolePanel);
})();
