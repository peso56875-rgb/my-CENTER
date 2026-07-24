(() => {
  'use strict';

  const tableBody = document.querySelector('#table-body');
  const searchInput = document.querySelector('#search-input');
  const gradeFilter = document.querySelector('#grade-filter');
  const exportBtn = document.querySelector('#export-csv');
  const statusIndicator = document.querySelector('.status-indicator');

  const statTotal = document.querySelector('#stat-total');
  const statGrade1 = document.querySelector('#stat-grade1');
  const statGrade2 = document.querySelector('#stat-grade2');

  let allReservations = [];
  let isInitialLoaded = false;

  const gradeMap = {
    'First Secondary': 'الصف الأول الثانوي (P)',
    'Second Secondary': 'الصف الثاني الثانوي (A)'
  };

  function formatPhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length === 11) {
      return `+20 ${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return phone || '—';
  }

  function formatDate(timestamp) {
    if (!timestamp) return '—';
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return '—';
    }
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ar-EG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderTable(data) {
    if (!data || data.length === 0) {
      const hasSearch = (searchInput && searchInput.value.trim() !== '') || (gradeFilter && gradeFilter.value !== 'ALL');
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state">
            <span>${hasSearch ? 'لا توجد حجوزات مطابقة للبحث.' : 'لا توجد أي حجوزات مسجلة حتى الآن.'}</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = data.map(item => {
      const rawPhone = (item.phone_number || '').replace(/\D/g, '');
      const formattedPhone = formatPhone(item.phone_number);
      const gradeText = gradeMap[item.grade] || item.grade || 'غير محدد';
      const gradeBadgeClass = item.grade === 'First Secondary' ? 'grade-badge-1' : 'grade-badge-2';
      const dateText = formatDate(item.created_at || item.reservation_date);
      const waUrl = rawPhone ? `https://wa.me/20${rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone}` : '#';

      return `
        <tr>
          <td><span class="code-tag">${item.reservation_number || 'P/A'}</span></td>
          <td><span class="student-name">${item.student_name || 'بدون اسم'}</span></td>
          <td><span class="phone-num" dir="ltr">${formattedPhone}</span></td>
          <td><span class="grade-badge ${gradeBadgeClass}">${gradeText}</span></td>
          <td>${dateText}</td>
          <td>
            ${rawPhone ? `<a href="${waUrl}" target="_blank" class="wa-btn">💬 مراسلة</a>` : '—'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateStats(data) {
    if (statTotal) statTotal.textContent = data.length;
    const g1Count = data.filter(i => i.grade === 'First Secondary').length;
    const g2Count = data.filter(i => i.grade === 'Second Secondary').length;
    if (statGrade1) statGrade1.textContent = g1Count;
    if (statGrade2) statGrade2.textContent = g2Count;
  }

  function filterAndRender() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const selectedGrade = gradeFilter ? gradeFilter.value : 'ALL';

    const filtered = allReservations.filter(item => {
      const nameMatch = (item.student_name || '').toLowerCase().includes(query);
      const phoneMatch = (item.phone_number || '').includes(query);
      const codeMatch = (item.reservation_number || '').toLowerCase().includes(query);
      const matchesSearch = nameMatch || phoneMatch || codeMatch;
      const matchesGrade = selectedGrade === 'ALL' || item.grade === selectedGrade;

      return matchesSearch && matchesGrade;
    });

    renderTable(filtered);
  }

  // Set 15-second connection timeout guard to allow database provisioning and initial connection
  const connectionTimeout = setTimeout(() => {
    if (!isInitialLoaded) {
      if (statusIndicator) {
        statusIndicator.innerHTML = '<i style="background:#ff4d4d;box-shadow:0 0 10px #ff4d4d;"></i> خطأ في الاتصال بالفايربيز';
      }
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state" style="color: #ff9d9d; line-height: 1.8;">
            <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 8px; color: #ff7c73;">⚠️ تعذّر الاتصال بقاعدة بيانات الفايربيز (Cloud Firestore)</div>
            <div>يرجى التأكد من التبويب <strong>Data</strong> في <strong>Firebase Console</strong>:</div>
            <ul style="text-align: right; display: inline-block; margin-top: 10px; font-size: 0.85rem; color: #ccc;">
              <li>1. في صفحة <strong>Cloud Firestore</strong>، اضغط على تبويب <strong>Data</strong> (بجوار تبويب Security).</li>
              <li>2. اضغط على زر <strong>Create Database (إنشاء قاعدة البيانات)</strong> في حال عدم إنشائها بعد.</li>
              <li>3. انتظر دقيقة واحدة لاكتمال إنشاء قاعدة البيانات على سيرفرات جوجل.</li>
            </ul>
          </td>
        </tr>
      `;
    }
  }, 15000);

  // ── Firestore Realtime Listener ──
  db.collection('reservations')
    .onSnapshot(snapshot => {
      isInitialLoaded = true;
      clearTimeout(connectionTimeout);

      if (statusIndicator) {
        statusIndicator.innerHTML = `<i style="background:var(--acid);box-shadow:0 0 10px var(--acid);"></i> متصل بـ Firebase (${snapshot.docs.length} حجز)`;
      }

      allReservations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by prefix (P/A) and sequence number descending
      allReservations.sort((a, b) => {
        const numA = parseInt((a.reservation_number || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.reservation_number || '').replace(/\D/g, '')) || 0;
        return numB - numA;
      });

      updateStats(allReservations);
      filterAndRender();
    }, error => {
      isInitialLoaded = true;
      clearTimeout(connectionTimeout);
      console.error('Error fetching reservations:', error);

      if (statusIndicator) {
        statusIndicator.innerHTML = '<i style="background:#ff4d4d;box-shadow:0 0 10px #ff4d4d;"></i> خطأ في الاتصال بالفايربيز';
      }

      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state" style="color: #ff7c73; line-height: 1.8;">
            <div style="font-size: 1rem; font-weight: bold; margin-bottom: 6px;">حدث خطأ في تحميل البيانات من الفايربيز</div>
            <div style="font-size: 0.85rem; color: #ff9d9d; direction: ltr; margin-bottom: 6px;">${error.message}</div>
            <div style="font-size: 0.85rem; color: #d3d5d8;">
              💡 <strong>حل المشكلة:</strong> اضغط على تبويب <strong>Data</strong> في Firebase Console للتأكد من تفعيل قواعد البيانات Create Database.
            </div>
          </td>
        </tr>
      `;
    });

  // Event Listeners for Filters
  if (searchInput) searchInput.addEventListener('input', filterAndRender);
  if (gradeFilter) gradeFilter.addEventListener('change', filterAndRender);

  // CSV Export
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!allReservations.length) {
        alert('لا توجد بيانات للتصدير!');
        return;
      }

      const headers = ['كود الحجز', 'اسم الطالب', 'رقم الموبايل', 'الصف الدراسي', 'تاريخ الحجز'];
      const rows = allReservations.map(i => [
        i.reservation_number || '',
        `"${(i.student_name || '').replace(/"/g, '""')}"`,
        `"${i.phone_number || ''}"`,
        `"${gradeMap[i.grade] || i.grade || ''}"`,
        `"${formatDate(i.created_at || i.reservation_date)}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PESO_Reservations_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

})();
