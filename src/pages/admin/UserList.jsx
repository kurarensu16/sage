import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Plus, Edit2, Trash2, Power, UserCheck, CheckCircle, AlertCircle } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function UserList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Load users from mockDb
  const loadUsers = () => {
    setUsers(mockDb.getUsers());
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Filtered Users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    const matchesDept = deptFilter ? user.department === deptFilter : true;
    
    return matchesSearch && matchesRole && matchesDept;
  });

  // Toggle User Active Status
  const handleToggleStatus = (userId) => {
    const updatedUser = users.find(u => u.id === userId);
    if (updatedUser) {
      const nextStatus = updatedUser.status === 'active' ? 'inactive' : 'active';
      mockDb.saveUser({ ...updatedUser, status: nextStatus });
      loadUsers();
    }
  };

  // Delete User
  const handleDeleteUser = (userId) => {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      mockDb.deleteUser(userId);
      loadUsers();
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase font-mono">Admin</span>;
      case 'dean':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">Dean</span>;
      case 'faculty':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase font-mono">Faculty</span>;
      case 'student':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase font-mono">Student</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader title="User Management" breadcrumb="Admin Portal">
        <Link 
          to="/admin/userform" 
          className="px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add New User
        </Link>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search by name or email..." 
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="dean">Dean</option>
              <option value="faculty">Faculty</option>
              <option value="student">Student</option>
            </select>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors"
            >
              <option value="">All Departments</option>
              <option value="College of IT">College of IT</option>
              <option value="College of CS">College of CS</option>
            </select>
          </div>
        </div>

        {/* User Table Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 font-display text-sm">
                          {user.lastName}, {user.firstName} {user.middleName && user.middleName[0] + '.'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {user.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          user.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleToggleStatus(user.id)}
                            title={user.status === 'active' ? 'Disable Account' : 'Enable Account'}
                            className={`p-1.5 rounded-md border ${
                              user.status === 'active' 
                                ? 'text-rose-600 hover:bg-rose-50 border-rose-100' 
                                : 'text-emerald-600 hover:bg-emerald-50 border-emerald-100'
                            } transition-colors`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          
                          <button 
                            onClick={() => navigate(`/admin/userform?id=${user.id}`)}
                            title="Edit User Details"
                            className="p-1.5 text-slate-600 hover:text-sage-600 hover:bg-slate-50 rounded-md border border-slate-100 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            title="Delete User"
                            disabled={user.role === 'admin'}
                            className={`p-1.5 rounded-md border transition-colors ${
                              user.role === 'admin' 
                                ? 'text-slate-300 border-slate-100 cursor-not-allowed' 
                                : 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-100'
                            }`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400 text-sm">
                      No users match your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
