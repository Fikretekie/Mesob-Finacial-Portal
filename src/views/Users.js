import React, { useState, useEffect, useRef } from "react";
import DataTable from "react-data-table-component";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Input,
  Spinner,
  Button,
  Badge,
} from "reactstrap";
import PanelHeader from "components/PanelHeader/PanelHeader.js";
import axios from "axios";
import { apiUrl, ROUTES } from "../config/api";
import { Helmet } from "react-helmet";
import NotificationAlert from "react-notification-alert";
import "react-notification-alert/dist/animate.css";
import { useDispatch } from "react-redux";
import { setSelectedUser } from "../store/userSlice";

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const notificationAlertRef = useRef(null);
  const dispatch = useDispatch();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleUserSelect = (user) => {
    dispatch(setSelectedUser({ id: user.id, email: user.email }));
    notify("tr", `Selected user: ${user.email}`, "success");
  };

  // Desktop columns
  const desktopColumns = [
    {
      name: "User ID",
      selector: (row) => row.id,
      sortable: true,
      width: "120px",
    },
    {
      name: "Email",
      selector: (row) => row.email,
      sortable: true,
      minWidth: "200px",
      wrap: true,
    },
    {
      name: "Name",
      selector: (row) => row.name || "-",
      sortable: true,
      width: "150px",
    },
    {
      name: "Company",
      selector: (row) => row.companyName || "-",
      sortable: true,
      width: "150px",
    },
    {
      name: "Balance",
      selector: (row) => row.cashBalance || 0,
      sortable: true,
      width: "120px",
      cell: (row) => `$${row.cashBalance || "0"}`,
    },
    {
      name: "Role",
      selector: (row) => row.role || "-",
      sortable: true,
      width: "100px",
      cell: (row) => (
        <Badge color={row.role === 2 ? "info" : "warning"}>
          {row.role === 2 ? "Customer" : row.role === 1 ? "Customer 1" : row.role === 0 ? "Super admin" : "Unknown"}
        </Badge>
      ),
    },
    {
      name: "Select",
      cell: (row) => (
        <Button
          color="primary"
          size="sm"
          onClick={() => handleUserSelect(row)}
          className="w-100"
        >
          Select
        </Button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: "100px",
    },
  ];

  const notify = (place, message, type) => {
    const options = {
      place: place,
      message: <div>{message}</div>,
      type: type,
      icon: "now-ui-icons ui-1_bell-53",
      autoDismiss: 7,
    };
    notificationAlertRef.current.notificationAlert(options);
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          apiUrl(ROUTES.USERS),
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        if (response.data) {
          setUsers(Array.isArray(response.data) ? response.data : []);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        notify(
          "tr",
          error.response?.data?.message || "Failed to fetch users",
          "danger"
        );
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const filteredData = users.filter((item) => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      item.email?.toLowerCase().includes(searchTermLower) ||
      item.id?.toString().toLowerCase().includes(searchTermLower) ||
      item.name?.toLowerCase().includes(searchTermLower) ||
      item.companyName?.toLowerCase().includes(searchTermLower)
    );
  });

  // Mobile Card Component
  const MobileUserCard = ({ user }) => (
    <Card className="mb-3">
      <CardBody>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="flex-grow-1">
            <h6 className="font-weight-bold mb-1">{user.email}</h6>
            {user.name && (
              <p className="text-muted mb-1 small">Name: {user.name}</p>
            )}
            {user.companyName && (
              <p className="text-muted mb-1 small">
                Company: {user.companyName}
              </p>
            )}
            <p className="text-muted mb-1 small">ID: {user.id}</p>
            <div className="d-flex justify-content-between align-items-center mt-2">
              <Badge color={user.role === 2 ? "info" : "warning"}>

                {user.role === 2 ? "Customer" : user.role === 1 ? "Customer 1" : user.role === 0 ? "Super admin" : "Unknown"}
              </Badge>
              <span className="font-weight-bold text-success">
                ${user.cashBalance || "0"}
              </span>
            </div>
          </div>
        </div>
        <Button
          color="primary"
          size="sm"
          onClick={() => handleUserSelect(user)}
          className="w-100 mt-2"
        >
          Select User
        </Button>
      </CardBody>
    </Card>
  );

  return (
    <>
      <Helmet>
        <title>Users - Meksova</title>
      </Helmet>

      <NotificationAlert ref={notificationAlertRef} />
      <div className="content" style={{marginTop:80}}>
        <Row>
          <Col xs={12} style={{ paddingInline: 0 }}>
            <Card>
              <CardHeader>
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <CardTitle tag="h4" className="mb-0">
                    Users Management
                  </CardTitle>
                  <div className="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center w-100 w-md-auto gap-2">
                    <Button
                      color="secondary"
                      className="btn-round btn-sm"
                      style={{ minWidth: "120px" }}
                    >
                      Users <span className="ml-2">({users.length})</span>
                    </Button>
                    <Input
                      type="text"
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-100"
                      style={{ 
                        minWidth: "200px",
                        backgroundColor: "var(--surface-2)",
                        color: "var(--text-1)",
                        borderColor: "var(--text-1)",
                      }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                {error ? (
                  <div className="text-center py-4 text-danger">{error}</div>
                ) : loading ? (
                  <div className="text-center py-4">
                    <Spinner color="primary" />
                    <p className="mt-2">Loading users...</p>
                  </div>
                ) : isMobile ? (
                  // Mobile Card Layout
                  <div>
                    {filteredData.length === 0 ? (
                      <div className="text-center py-4 text-muted">
                        No users found
                      </div>
                    ) : (
                      filteredData.map((user) => (
                        <MobileUserCard key={user.id} user={user} />
                      ))
                    )}
                  </div>
                ) : (
                  // Desktop Table Layout
                  <div className="table-responsive">
                    <DataTable
                      columns={desktopColumns}
                      data={filteredData}
                      pagination
                      responsive
                      highlightOnHover
                      fixedHeader
                      fixedHeaderScrollHeight="400px"
                      noDataComponent={
                        <div className="text-center py-4 text-muted">
                          No users found
                        </div>
                      }
                      customStyles={{
                        headCells: {
                          style: {
                            backgroundColor: "var(--surface-2)",
                            color: "var(--text-1)",
                            fontWeight: "bold",
                            fontSize: "14px",
                            borderBottom: "1px solid #817646",
                          },
                        },
                        cells: {
                          style: {
                            fontSize: "14px",
                            padding: "8px",
                            color: "var(--text-1)",
                            backgroundColor: "var(--surface-2)",
                            borderBottom: "1px solid rgba(129, 118, 70, 0.2)",
                          },
                        },
                        rows: {
                          style: {
                            backgroundColor: "var(--surface-2)",
                            border: "none",
                            "&:hover": {
                              backgroundColor: "#1a2332 !important",
                              border: "none !important",
                              outline: "none !important",
                            },
                          },
                        },
                        pagination: {
                          style: {
                            backgroundColor: "var(--surface-2)",
                            color: "var(--text-1)",
                            borderTop: "1px solid #817646",
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    </>
  );
}

export default Users;
