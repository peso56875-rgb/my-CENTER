(() => {
  'use strict';

  const tableBody = document.querySelector('#table-body');
  const searchInput = document.querySelector('#search-input');
  const gradeFilter = document.querySelector('#grade-filter');
  const exportBtn = document.querySelector('#export-csv');

  const statTotal = document.querySelector('#stat-total');
  const statGrade1 = document.querySelector('#stat-grade1');
  const statGrade2 = document.querySelector('#stat-grade2');

  let allReservations = [];

  const gradeMap = {
    'First Secondary': 'الصف الأول الثانوي (P)',
    'Second Secondary': 'الصف الثاني الثانوي (A)'
  };

  function formatPhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length === 11) {
      return `+20 ${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return phone;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '—';
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return '—';
    }
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
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state">
            <span>لا توجد حجوزات مطابقة للبحث.</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = data.map(item => {
      const rawPhone = (item.phone_number || '').replace(/\D/g, '');
      const formattedPhone = formatPhone(item.phone_number);
      const gradeText = gradeMap[item.grade] || item.grade || 'غير حدد';
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
    statTotal.textContent = data.length;
    const g1Count = data.filter(i => i.grade === 'First Secondary').length;
    const g2Count = data.filter(i => i.grade === 'Second Secondary').length;
    statGrade1.textContent = g1Count;
    statGrade2.textContent = g2Count;
  }

  function filterAndRender() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedGrade = gradeFilter.value;

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

  // ── Firestore Realtime Listener ──
  db.collection('reservations')
    .onSnapshot(snapshot => {
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
      console.error('Error fetching reservations:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state" style="color: #ff7c73;">
            حدث خطأ في تحميل البيانات من الفايربيز: ${error.message}
          </td>
        </tr>
      `;
    });

  // Event Listeners for Filters
  searchInput.addEventListener('input', filterAndRender);
  gradeFilter.addEventListener('change', filterAndRender);

  // CSV Export
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
      `"${i.reservation_date || ''}"`
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

})();
